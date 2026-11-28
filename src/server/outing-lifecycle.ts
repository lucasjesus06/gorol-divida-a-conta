import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { accessRequests, billClaims, billItems, consumptionBills, outingParticipants, outings, payments, people } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { outingClosed, participantLeft, participantRemoved } from "@/domain/notification";
import { assertCanClose, assertCanLeave, closeBlockers, leaveBlockers, type Blocker, type LeaveInput } from "@/domain/outing-closing";
import { assertAdmin } from "@/domain/outing-access";
import { computeOutingBalances } from "@/domain/outing-balance";
import { pairStatement } from "@/domain/pair-statement";
import { loadLedgerForOutings } from "./balances";
import { assertActiveOuting, outingContext } from "./expenses";
import { notify } from "./push";

export async function closeInput(outingId: string, names: Map<string, string>) {
  const ledger = await loadLedgerForOutings([outingId]);
  const balances = computeOutingBalances(outingId, ledger.expenses, ledger.payments);

  const [participants, pendingPayments, bills, requests] = await Promise.all([
    asService(() =>
      getDb()
        .select({ personId: outingParticipants.personId, userId: people.userId, accountApprovedAt: people.accountApprovedAt })
        .from(outingParticipants)
        .innerJoin(people, eq(people.id, outingParticipants.personId))
        .where(and(eq(outingParticipants.outingId, outingId), isNull(outingParticipants.leftAt))),
    ),
    getDb().select({ id: payments.id }).from(payments).where(and(eq(payments.outingId, outingId), eq(payments.status, "declared"))),
    getDb().select({ id: consumptionBills.id }).from(consumptionBills).where(and(eq(consumptionBills.outingId, outingId), inArray(consumptionBills.status, ["open", "closing"]))),
    asService(() => getDb().select({ guestUserId: accessRequests.guestUserId }).from(accessRequests).where(eq(accessRequests.status, "pending"))),
  ]);
  const pendingGuests = new Set(requests.map((request) => request.guestUserId));
  const awaiting = participants.filter((participant) => participant.accountApprovedAt === null && participant.userId !== null && pendingGuests.has(participant.userId));

  return {
    people: [...balances.values()].map((balance) => ({ personId: balance.participantId, netCents: balance.netCents })),
    balances: [...balances.values()].map((balance) => ({ name: names.get(balance.participantId) ?? "Pessoa", netCents: balance.netCents })),
    pendingPayments: pendingPayments.length,
    guestsAwaitingAccount: awaiting.map((participant) => names.get(participant.personId) ?? "Pessoa"),
    openBills: bills.length,
  };
}

/** What still stops the owner from closing the outing; empty when it can be closed. */
export async function getCloseBlockers(personId: string, outingId: string): Promise<Blocker[]> {
  const context = await outingContext(personId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  if (context.outing.status !== "active") {
    return [];
  }
  return closeBlockers(await closeInput(outingId, context.names));
}

/** Marks the outing as closed and tells the others. The caller has already checked that closing is allowed. */
export async function finalizeClose(personId: string, outingId: string, context: Awaited<ReturnType<typeof outingContext>>): Promise<void> {
  const closed = await asService(() =>
    getDb()
      .update(outings)
      .set({ status: "closed", closedAt: new Date(), closedBy: personId })
      .where(and(eq(outings.id, outingId), eq(outings.status, "active")))
      .returning({ id: outings.id }),
  );
  if (closed.length === 0) {
    throw new DomainError("outing_closed", "Este rolê já foi encerrado.");
  }
  await Promise.all(
    context.participants.filter((participant) => participant.personId !== personId).map((participant) => notify(participant.personId, outingClosed({ outingId, outingName: context.outing.name }))),
  );
}

/** The owner closes an outing that has nothing left to settle. Debts between people are not erased. */
export async function closeOuting(personId: string, outingId: string): Promise<void> {
  const context = await outingContext(personId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  assertActiveOuting(context.outing.status);
  assertCanClose(await closeInput(outingId, context.names));
  await finalizeClose(personId, outingId, context);
}

async function leaveInput(outingId: string, targetId: string, context: Awaited<ReturnType<typeof outingContext>>): Promise<LeaveInput> {
  const ledger = await loadLedgerForOutings([outingId]);
  const others = context.participants.filter((participant) => participant.personId !== targetId);
  const openWith = others.map((other) => ({
    name: other.name,
    netCents: pairStatement(targetId, other.personId, ledger.expenses, ledger.payments).netByOutingCents.get(outingId) ?? 0,
  }));

  const [pending, claims] = await Promise.all([
    getDb()
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.outingId, outingId), eq(payments.status, "declared"), or(eq(payments.fromId, targetId), eq(payments.toId, targetId), eq(payments.onBehalfOfId, targetId)))),
    getDb()
      .select({ itemId: billClaims.itemId })
      .from(billClaims)
      .innerJoin(billItems, eq(billItems.id, billClaims.itemId))
      .innerJoin(consumptionBills, eq(consumptionBills.id, billItems.billId))
      .where(and(eq(consumptionBills.outingId, outingId), inArray(consumptionBills.status, ["open", "closing"]), eq(billClaims.personId, targetId))),
  ]);
  return {
    isOwner: context.participants.some((participant) => participant.personId === targetId && participant.role === "admin"),
    openWith,
    pendingPayments: pending.length,
    hasOpenBillClaims: claims.length > 0,
  };
}

async function leave(actorId: string, outingId: string, targetId: string, self: boolean) {
  const context = await outingContext(actorId, outingId);
  assertActiveOuting(context.outing.status);
  const target = context.participants.find((participant) => participant.personId === targetId);
  if (!target) {
    throw new DomainError("participant_not_found", "Esta pessoa não está mais no rolê.");
  }
  assertCanLeave(await leaveInput(outingId, targetId, context), self);

  const updated = await asService(() =>
    getDb()
      .update(outingParticipants)
      .set({ leftAt: new Date(), leftBy: actorId })
      .where(and(eq(outingParticipants.outingId, outingId), eq(outingParticipants.personId, targetId), isNull(outingParticipants.leftAt)))
      .returning({ id: outingParticipants.id }),
  );
  if (updated.length === 0) {
    throw new DomainError("participant_not_found", "Esta pessoa não está mais no rolê.");
  }
  if (self) {
    const owner = context.participants.find((participant) => participant.role === "admin");
    if (owner) {
      await notify(owner.personId, participantLeft({ personName: target.name, outingId, outingName: context.outing.name }));
    }
  } else {
    await notify(targetId, participantRemoved({ outingName: context.outing.name }));
  }
}

/** A member leaves on their own, only when nothing is open with anyone. */
export async function leaveOuting(personId: string, outingId: string): Promise<void> {
  await leave(personId, outingId, personId, true);
}

/** Only the owner removes someone, and only when the removal harms nobody: nothing open with any other person. */
export async function removeParticipant(ownerId: string, outingId: string, targetId: string): Promise<void> {
  const context = await outingContext(ownerId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  if (targetId === ownerId) {
    throw new DomainError("owner_cannot_leave", "O dono não sai do rolê: encerre o rolê quando tudo estiver acertado.");
  }
  await leave(ownerId, outingId, targetId, false);
}

/** Why this person cannot leave now, to show before they try. */
export async function getLeaveBlockers(actorId: string, outingId: string, targetId: string) {
  const context = await outingContext(actorId, outingId);
  if (actorId !== targetId) {
    assertAdmin({ role: context.outing.role, status: "active" });
  }
  return leaveBlockers(await leaveInput(outingId, targetId, context));
}
