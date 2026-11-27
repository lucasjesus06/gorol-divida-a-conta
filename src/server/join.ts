import "server-only";
import { and, count, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { outingJoinAttempts, outingJoinLinks, outingJoinRequests, outingParticipants, outings, people } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { JOIN_ATTEMPT_WINDOW_MINUTES, assertJoinAttemptsAllowed, joinLinkExpiry } from "@/domain/join";
import { assertAdmin } from "@/domain/outing-access";
import { normalizePhone } from "@/domain/phone";
import { findOuting } from "./outings";
import { hashToken, newToken } from "./token";

const LINK_UNAVAILABLE = () => new DomainError("link_unavailable", "Este link não vale mais. Peça outro a quem organiza o rolê.");

async function adminOuting(personId: string, outingId: string) {
  const outing = await findOuting(personId, outingId);
  assertAdmin({ role: outing.role, status: "active" });
  return outing;
}

export async function createJoinLink(personId: string, outingId: string) {
  const outing = await adminOuting(personId, outingId);
  if (outing.status !== "active") {
    throw new DomainError("outing_closed", "Este rolê já foi encerrado.");
  }
  const token = newToken();
  await asService(() =>
    getDb().transaction(async (tx) => {
      await tx
        .update(outingJoinLinks)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(outingJoinLinks.outingId, outingId), isNull(outingJoinLinks.revokedAt)));
      await tx
        .insert(outingJoinLinks)
        .values({ outingId, tokenHash: hashToken(token), createdBy: personId, expiresAt: joinLinkExpiry(new Date()) });
    }),
  );
  return token;
}

export async function revokeJoinLink(personId: string, outingId: string) {
  await adminOuting(personId, outingId);
  await asService(() =>
    getDb()
      .update(outingJoinLinks)
      .set({ revokedAt: sql`now()` })
      .where(and(eq(outingJoinLinks.outingId, outingId), isNull(outingJoinLinks.revokedAt))),
  );
}

export async function getActiveJoinLink(personId: string, outingId: string) {
  await adminOuting(personId, outingId);
  const [link] = await asService(() =>
    getDb()
      .select({ expiresAt: outingJoinLinks.expiresAt })
      .from(outingJoinLinks)
      .where(and(eq(outingJoinLinks.outingId, outingId), isNull(outingJoinLinks.revokedAt), gt(outingJoinLinks.expiresAt, sql`now()`))),
  );
  return link ?? null;
}

async function findLink(token: string) {
  const [link] = await getDb()
    .select({ outingId: outingJoinLinks.outingId, outingName: outings.name })
    .from(outingJoinLinks)
    .innerJoin(outings, eq(outings.id, outingJoinLinks.outingId))
    .where(
      and(
        eq(outingJoinLinks.tokenHash, hashToken(token)),
        isNull(outingJoinLinks.revokedAt),
        gt(outingJoinLinks.expiresAt, sql`now()`),
        eq(outings.status, "active"),
      ),
    );
  return link ?? null;
}

export async function getJoinPage(token: string) {
  return asService(async () => {
    const link = await findLink(token);
    if (!link) {
      return null;
    }
    const pending = await getDb()
      .select({ id: outingParticipants.id, displayName: outingParticipants.displayName })
      .from(outingParticipants)
      .where(
        and(
          eq(outingParticipants.outingId, link.outingId),
          isNull(outingParticipants.confirmedAt),
          sql`not exists (select 1 from outing_join_requests r where r.participant_id = ${outingParticipants.id} and r.status = 'pending')`,
        ),
      )
      .orderBy(outingParticipants.displayName);
    return { outingName: link.outingName, participants: pending };
  });
}

export async function requestJoin(token: string, guestUserId: string, input: { participantId: string; phone: string }) {
  const phone = normalizePhone(input.phone);
  return asService(async () => {
    const link = await findLink(token);
    if (!link) {
      throw LINK_UNAVAILABLE();
    }

    const [target] = await getDb()
      .select({ id: outingParticipants.id, phone: people.phone })
      .from(outingParticipants)
      .innerJoin(people, eq(people.id, outingParticipants.personId))
      .where(
        and(
          eq(outingParticipants.id, input.participantId),
          eq(outingParticipants.outingId, link.outingId),
          isNull(outingParticipants.confirmedAt),
        ),
      );
    if (!target) {
      throw new DomainError("participant_unavailable", "Este nome não está mais disponível. Escolha outro ou fale com quem organiza o rolê.");
    }

    const since = sql`now() - make_interval(mins => ${JOIN_ATTEMPT_WINDOW_MINUTES})`;
    const failed = (extra: ReturnType<typeof eq>) =>
      getDb()
        .select({ total: count() })
        .from(outingJoinAttempts)
        .where(and(eq(outingJoinAttempts.succeeded, false), sql`${outingJoinAttempts.createdAt} > ${since}`, extra))
        .then(([row]) => row.total);
    assertJoinAttemptsAllowed({
      forParticipant: await failed(eq(outingJoinAttempts.participantId, target.id)),
      forOuting: await failed(eq(outingJoinAttempts.outingId, link.outingId)),
    });

    const matches = target.phone === phone;
    await getDb().insert(outingJoinAttempts).values({ outingId: link.outingId, participantId: target.id, succeeded: matches });
    if (!matches) {
      throw new DomainError("phone_mismatch", "O telefone não confere com o que quem organiza o rolê cadastrou.");
    }

    const [mine] = await getDb()
      .select({ id: outingJoinRequests.id })
      .from(outingJoinRequests)
      .where(
        and(
          eq(outingJoinRequests.outingId, link.outingId),
          eq(outingJoinRequests.guestUserId, guestUserId),
          eq(outingJoinRequests.status, "pending"),
        ),
      );
    if (mine) {
      throw new DomainError("already_requested", "Você já pediu para entrar neste rolê. Aguarde a aprovação.");
    }
    await getDb()
      .insert(outingJoinRequests)
      .values({ outingId: link.outingId, participantId: target.id, guestUserId });
  });
}

export async function listJoinRequests(personId: string, outingId: string) {
  await adminOuting(personId, outingId);
  return asService(() =>
    getDb()
      .select({
        id: outingJoinRequests.id,
        name: outingParticipants.displayName,
        createdAt: outingJoinRequests.createdAt,
      })
      .from(outingJoinRequests)
      .innerJoin(outingParticipants, eq(outingParticipants.id, outingJoinRequests.participantId))
      .where(and(eq(outingJoinRequests.outingId, outingId), eq(outingJoinRequests.status, "pending")))
      .orderBy(desc(outingJoinRequests.createdAt)),
  );
}

export async function decideJoinRequest(personId: string, outingId: string, requestId: string, approve: boolean) {
  await adminOuting(personId, outingId);
  await asService(() =>
    getDb().transaction(async (tx) => {
      const [request] = await tx
        .select({
          id: outingJoinRequests.id,
          participantId: outingJoinRequests.participantId,
          guestUserId: outingJoinRequests.guestUserId,
        })
        .from(outingJoinRequests)
        .where(
          and(
            eq(outingJoinRequests.id, requestId),
            eq(outingJoinRequests.outingId, outingId),
            eq(outingJoinRequests.status, "pending"),
          ),
        )
        .for("update");
      if (!request) {
        throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
      }

      if (approve) {
        const [participant] = await tx
          .select({ personId: outingParticipants.personId, accountApprovedAt: people.accountApprovedAt })
          .from(outingParticipants)
          .innerJoin(people, eq(people.id, outingParticipants.personId))
          .where(eq(outingParticipants.id, request.participantId));
        if (participant.accountApprovedAt !== null) {
          throw new DomainError("person_has_account", "Esta pessoa tem conta e entra pelo próprio login.");
        }
        const [linkedElsewhere] = await tx
          .select({ id: people.id })
          .from(people)
          .where(eq(people.userId, request.guestUserId));
        if (linkedElsewhere && linkedElsewhere.id !== participant.personId) {
          throw new DomainError("guest_linked_elsewhere", "Esta sessão já está vinculada a outra pessoa.");
        }
        await tx.update(people).set({ userId: request.guestUserId }).where(eq(people.id, participant.personId));
        await tx
          .update(outingParticipants)
          .set({ confirmedAt: sql`now()` })
          .where(eq(outingParticipants.id, request.participantId));
      }

      await tx
        .update(outingJoinRequests)
        .set({ status: approve ? "approved" : "rejected", decidedBy: personId, decidedAt: sql`now()` })
        .where(eq(outingJoinRequests.id, request.id));
    }),
  );
}

export async function releaseParticipant(personId: string, outingId: string, participantId: string) {
  await adminOuting(personId, outingId);
  await asService(async () => {
    const released = await getDb()
      .update(outingParticipants)
      .set({ confirmedAt: null })
      .where(
        and(
          eq(outingParticipants.id, participantId),
          eq(outingParticipants.outingId, outingId),
          eq(outingParticipants.role, "member"),
          sql`exists (select 1 from people p where p.id = ${outingParticipants.personId} and p.account_approved_at is null)`,
        ),
      )
      .returning({ id: outingParticipants.id });
    if (released.length === 0) {
      throw new DomainError("participant_not_releasable", "Não é possível liberar este nome.");
    }
  });
}

export async function getGuestJoinStatus(guestUserId: string) {
  return asService(async () => {
    const [latest] = await getDb()
      .select({ status: outingJoinRequests.status, outingName: outings.name })
      .from(outingJoinRequests)
      .innerJoin(outings, eq(outings.id, outingJoinRequests.outingId))
      .where(eq(outingJoinRequests.guestUserId, guestUserId))
      .orderBy(desc(outingJoinRequests.createdAt))
      .limit(1);
    return latest ?? null;
  });
}

export async function countPendingJoinRequests(personId: string) {
  return asService(async () => {
    const [row] = await getDb()
      .select({ total: count() })
      .from(outingJoinRequests)
      .innerJoin(
        outingParticipants,
        and(
          eq(outingParticipants.outingId, outingJoinRequests.outingId),
          eq(outingParticipants.personId, personId),
          eq(outingParticipants.role, "admin"),
          isNotNull(outingParticipants.confirmedAt),
        ),
      )
      .where(eq(outingJoinRequests.status, "pending"));
    return row.total;
  });
}
