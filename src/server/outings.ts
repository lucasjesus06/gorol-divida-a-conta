import "server-only";
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { accessRequests, outingParticipants, outings, people } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { normalizeOutingName, parseOutingKind, type OutingKind, type OutingRole, type OutingStatus } from "@/domain/outing";
import { assertAdmin, assertParticipant, type Membership } from "@/domain/outing-access";
import { normalizeParticipantInput } from "@/domain/participant";
import { isApprovedPerson } from "./access";

export type OutingSummary = { id: string; name: string; kind: OutingKind; status: OutingStatus; role: OutingRole };

export type OutingDetail = {
  id: string;
  name: string;
  kind: OutingKind;
  status: OutingStatus;
  role: OutingRole;
  participants: { id: string; personId: string; displayName: string; role: OutingRole; phone: string | null; joined: boolean; releasable: boolean; accountRequested: boolean }[];
};

export async function createOuting(owner: { personId: string; displayName: string }, input: { name: string; kind: string }) {
  const name = normalizeOutingName(input.name);
  const kind = parseOutingKind(input.kind);
  if (!(await isApprovedPerson(owner.personId))) {
    throw new DomainError("account_not_approved", "Só quem tem conta aprovada cria rolês.");
  }
  return getDb().transaction(async (tx) => {
    const [outing] = await tx
      .insert(outings)
      .values({ name, kind, createdBy: owner.personId })
      .returning({ id: outings.id });
    await tx
      .insert(outingParticipants)
      .values({ outingId: outing.id, personId: owner.personId, displayName: owner.displayName, role: "admin" });
    return outing.id;
  });
}

export async function listOutings(personId: string): Promise<OutingSummary[]> {
  return getDb()
    .select({ id: outings.id, name: outings.name, kind: outings.kind, status: outings.status, role: outingParticipants.role })
    .from(outings)
    .innerJoin(outingParticipants, eq(outingParticipants.outingId, outings.id))
    .where(and(eq(outingParticipants.personId, personId), isNotNull(outingParticipants.confirmedAt)))
    .orderBy(desc(outings.createdAt));
}

export async function findOuting(personId: string, outingId: string) {
  const [row] = await getDb()
    .select({ id: outings.id, name: outings.name, kind: outings.kind, status: outings.status, role: outingParticipants.role })
    .from(outings)
    .innerJoin(outingParticipants, eq(outingParticipants.outingId, outings.id))
    .where(
      and(eq(outings.id, outingId), eq(outingParticipants.personId, personId), isNotNull(outingParticipants.confirmedAt)),
    );
  const membership: Membership = row ? { role: row.role, status: "active" } : null;
  assertParticipant(membership);
  return row;
}

export async function getOuting(personId: string, outingId: string): Promise<OutingDetail> {
  const outing = await findOuting(personId, outingId);
  const participants = await getDb()
    .select({
      id: outingParticipants.id,
      personId: outingParticipants.personId,
      displayName: outingParticipants.displayName,
      role: outingParticipants.role,
      confirmedAt: outingParticipants.confirmedAt,
    })
    .from(outingParticipants)
    .where(eq(outingParticipants.outingId, outingId))
    .orderBy(asc(outingParticipants.joinedAt));

  if (outing.role !== "admin") {
    return { ...outing, participants: participants.map(({ confirmedAt, ...participant }) => ({ ...participant, phone: null, joined: confirmedAt !== null, releasable: false, accountRequested: false })) };
  }

  const phones = await asService(() =>
    getDb()
      .select({ id: outingParticipants.id, phone: people.phone, accountApprovedAt: people.accountApprovedAt, userId: people.userId })
      .from(outingParticipants)
      .innerJoin(people, eq(people.id, outingParticipants.personId))
      .where(eq(outingParticipants.outingId, outingId)),
  );
  const contactByParticipant = new Map(phones.map((row) => [row.id, row]));
  const requestedAccounts = new Set(
    (
      await asService(() =>
        getDb()
          .select({ guestUserId: accessRequests.guestUserId })
          .from(accessRequests)
          .where(eq(accessRequests.status, "pending")),
      )
    ).map((row) => row.guestUserId),
  );
  return {
    ...outing,
    participants: participants.map(({ confirmedAt, ...participant }) => {
      const contact = contactByParticipant.get(participant.id);
      const guestUserId = contact?.userId ?? null;
      return {
        ...participant,
        phone: contact?.phone ?? null,
        joined: confirmedAt !== null,
        accountRequested: guestUserId !== null && requestedAccounts.has(guestUserId),
        releasable: confirmedAt !== null && participant.role === "member" && contact?.accountApprovedAt == null,
      };
    }),
  };
}

export async function addParticipant(personId: string, outingId: string, input: { name: string; phone: string }) {
  const participant = normalizeParticipantInput(input);
  const outing = await findOuting(personId, outingId);
  assertAdmin({ role: outing.role, status: "active" });
  if (outing.status !== "active") {
    throw new DomainError("outing_closed", "Este rolê já foi encerrado.");
  }

  await asService(() =>
    getDb().transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: people.id, accountApprovedAt: people.accountApprovedAt })
        .from(people)
        .where(eq(people.phone, participant.phone))
        .for("update");
      const participantPersonId =
        existing?.id ??
        (
          await tx
            .insert(people)
            .values({ displayName: participant.displayName, phone: participant.phone })
            .returning({ id: people.id })
        )[0].id;
      const hasApprovedAccount = existing?.accountApprovedAt != null;

      const [alreadyIn] = await tx
        .select({ id: outingParticipants.id })
        .from(outingParticipants)
        .where(and(eq(outingParticipants.outingId, outingId), eq(outingParticipants.personId, participantPersonId)));
      if (alreadyIn) {
        throw new DomainError("already_participant", "Este telefone já está no rolê.");
      }

      const [nameTaken] = await tx
        .select({ id: outingParticipants.id })
        .from(outingParticipants)
        .where(
          and(
            eq(outingParticipants.outingId, outingId),
            sql`lower(${outingParticipants.displayName}) = lower(${participant.displayName})`,
          ),
        );
      if (nameTaken) {
        throw new DomainError("participant_name_taken", "Já existe alguém com esse nome no rolê.");
      }

      await tx
        .insert(outingParticipants)
        .values({
          outingId,
          personId: participantPersonId,
          displayName: participant.displayName,
          confirmedAt: hasApprovedAccount ? sql`now()` : null,
        });
    }),
  );
}
