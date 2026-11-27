import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { outingParticipants, outings, people } from "@/db/schema";
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
  participants: { id: string; displayName: string; role: OutingRole; phone: string | null }[];
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
    .where(eq(outingParticipants.personId, personId))
    .orderBy(desc(outings.createdAt));
}

async function findOuting(personId: string, outingId: string) {
  const [row] = await getDb()
    .select({ id: outings.id, name: outings.name, kind: outings.kind, status: outings.status, role: outingParticipants.role })
    .from(outings)
    .innerJoin(outingParticipants, eq(outingParticipants.outingId, outings.id))
    .where(and(eq(outings.id, outingId), eq(outingParticipants.personId, personId)));
  const membership: Membership = row ? { role: row.role, status: "active" } : null;
  assertParticipant(membership);
  return row;
}

export async function getOuting(personId: string, outingId: string): Promise<OutingDetail> {
  const outing = await findOuting(personId, outingId);
  const participants = await getDb()
    .select({ id: outingParticipants.id, displayName: outingParticipants.displayName, role: outingParticipants.role })
    .from(outingParticipants)
    .where(eq(outingParticipants.outingId, outingId))
    .orderBy(asc(outingParticipants.joinedAt));

  if (outing.role !== "admin") {
    return { ...outing, participants: participants.map((participant) => ({ ...participant, phone: null })) };
  }

  const phones = await asService(() =>
    getDb()
      .select({ id: outingParticipants.id, phone: people.phone })
      .from(outingParticipants)
      .innerJoin(people, eq(people.id, outingParticipants.personId))
      .where(eq(outingParticipants.outingId, outingId)),
  );
  const phoneByParticipant = new Map(phones.map((row) => [row.id, row.phone]));
  return {
    ...outing,
    participants: participants.map((participant) => ({ ...participant, phone: phoneByParticipant.get(participant.id) ?? null })),
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
      const [existing] = await tx.select({ id: people.id }).from(people).where(eq(people.phone, participant.phone)).for("update");
      const participantPersonId =
        existing?.id ??
        (
          await tx
            .insert(people)
            .values({ displayName: participant.displayName, phone: participant.phone })
            .returning({ id: people.id })
        )[0].id;

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
        .values({ outingId, personId: participantPersonId, displayName: participant.displayName });
    }),
  );
}
