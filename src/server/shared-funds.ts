import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { amnestyItems, amnesties, sharedFunds } from "@/db/schema";
import { planClearingAmnesty } from "@/domain/amnesty";
import { DomainError } from "@/domain/domain-error";
import { sharedFundRequested, sharedFundResolved } from "@/domain/notification";
import { pairStatement } from "@/domain/pair-statement";
import type { SharedFundStatus } from "@/domain/shared-fund-status";
import { accountIds, loadLedger } from "./balances";
import { notify } from "./push";

export type SharedFundView = {
  id: string;
  status: Extract<SharedFundStatus, "pending" | "active">;
  other: { id: string; name: string };
  requestedByMe: boolean;
  acceptedAt: Date | null;
};

export type FundCandidate = { id: string; name: string };

const open = ["pending", "active"] as const;

const pairOf = (x: string, y: string) => (x < y ? { personA: x, personB: y } : { personA: y, personB: x });

async function loadOpen(personId: string) {
  const [row] = await getDb()
    .select()
    .from(sharedFunds)
    .where(and(inArray(sharedFunds.status, open), or(eq(sharedFunds.personA, personId), eq(sharedFunds.personB, personId))));
  return row ?? null;
}

async function nameOf(personId: string, otherId: string) {
  const ledger = await loadLedger(personId);
  return ledger.personNames.get(otherId) ?? "Pessoa";
}

/** The pending or active arrangement of the reader, if there is one: only the two people can see it. */
export async function getMyFund(personId: string): Promise<SharedFundView | null> {
  const row = await loadOpen(personId);
  if (!row) {
    return null;
  }
  const otherId = row.personA === personId ? row.personB : row.personA;
  return {
    id: row.id,
    status: row.status as "pending" | "active",
    other: { id: otherId, name: await nameOf(personId, otherId) },
    requestedByMe: row.requestedBy === personId,
    acceptedAt: row.acceptedAt,
  };
}

/** People with an account who share an outing with the reader: the ones they can ask. */
export async function listFundCandidates(personId: string): Promise<FundCandidate[]> {
  const ledger = await loadLedger(personId);
  const others = [...ledger.personNames.keys()].filter((id) => id !== personId);
  const accounts = await accountIds([personId, ...others]);
  if (!accounts.has(personId)) {
    return [];
  }
  return others.filter((id) => accounts.has(id)).map((id) => ({ id, name: ledger.personNames.get(id) ?? "Pessoa" }));
}

export async function requestFund(personId: string, otherId: string): Promise<string> {
  if (personId === otherId) {
    throw new DomainError("shared_fund_same_person", "Escolha outra pessoa.");
  }
  const candidates = await listFundCandidates(personId);
  const other = candidates.find((candidate) => candidate.id === otherId);
  if (!other) {
    throw new DomainError("shared_fund_person_not_available", "Só dá para declarar com alguém que tem conta e divide um rolê com você.");
  }
  if (await loadOpen(personId)) {
    throw new DomainError("shared_fund_already_declared", "Você já tem uma declaração em andamento. Desfaça antes de fazer outra.");
  }

  const id = crypto.randomUUID();
  try {
    await getDb().insert(sharedFunds).values({ id, ...pairOf(personId, otherId), requestedBy: personId });
  } catch (error) {
    const text = `${(error as Error)?.message ?? ""} ${(error as { cause?: Error })?.cause?.message ?? ""}`;
    if (text.includes("shared_fund_person_already_in_one")) {
      throw new DomainError("shared_fund_person_busy", `${other.name} já tem uma declaração em andamento.`);
    }
    throw error;
  }
  const me = (await loadLedger(personId)).personNames.get(personId) ?? "Alguém";
  await notify(otherId, sharedFundRequested({ requesterName: me }));
  return id;
}

async function loadFor(personId: string, fundId: string) {
  const row = await loadOpen(personId);
  if (!row || row.id !== fundId) {
    throw new DomainError("shared_fund_not_found", "Declaração não encontrada.");
  }
  return { row, otherId: row.personA === personId ? row.personB : row.personA };
}

/**
 * The other person accepts. From now on nothing is owed between the two, and what was owed before is
 * forgiven in the same step, so the amnesty and the new arrangement exist together or not at all.
 */
export async function acceptFund(personId: string, fundId: string): Promise<void> {
  const { row, otherId } = await loadFor(personId, fundId);
  if (row.status !== "pending") {
    throw new DomainError("shared_fund_not_pending", "Esta declaração já foi respondida.");
  }
  if (row.requestedBy === personId) {
    throw new DomainError("shared_fund_only_the_other_answers", "Só a outra pessoa pode aceitar.");
  }

  const ledger = await loadLedger(personId);
  const owedToRequester = pairStatement(otherId, personId, ledger.expenses, ledger.payments, ledger.amnesties, ledger.funds).projectedNetCents;
  const creditorId = owedToRequester >= 0 ? otherId : personId;
  const debtorId = creditorId === otherId ? personId : otherId;
  const clearing = planClearingAmnesty(creditorId, debtorId, ledger.expenses, ledger.payments, ledger.amnesties);

  const now = new Date();
  await asService(() =>
    getDb().transaction(async (tx) => {
      const accepted = await tx
        .update(sharedFunds)
        .set({ status: "active", acceptedAt: now })
        .where(and(eq(sharedFunds.id, fundId), eq(sharedFunds.status, "pending"), or(eq(sharedFunds.personA, personId), eq(sharedFunds.personB, personId))))
        .returning({ id: sharedFunds.id });
      if (accepted.length === 0) {
        throw new DomainError("shared_fund_not_pending", "Esta declaração já foi respondida.");
      }
      if (clearing) {
        const amnestyId = crypto.randomUUID();
        await tx.insert(amnesties).values({ id: amnestyId, creditorId, debtorId, totalCents: clearing.totalCents, createdAt: now });
        await tx.insert(amnestyItems).values(clearing.items.map((item) => ({ amnestyId, outingId: item.outingId, expenseId: item.expenseId, amountCents: item.amountCents })));
      }
    }),
  );
  await notify(otherId, sharedFundResolved({ name: ledger.personNames.get(personId) ?? "Alguém", result: "accepted" }));
}

export async function declineFund(personId: string, fundId: string): Promise<void> {
  const { row, otherId } = await loadFor(personId, fundId);
  if (row.status !== "pending" || row.requestedBy === personId) {
    throw new DomainError("shared_fund_only_the_other_answers", "Só a outra pessoa pode recusar o pedido.");
  }
  const declined = await getDb()
    .update(sharedFunds)
    .set({ status: "declined" })
    .where(and(eq(sharedFunds.id, fundId), eq(sharedFunds.status, "pending")))
    .returning({ id: sharedFunds.id });
  if (declined.length === 0) {
    throw new DomainError("shared_fund_not_pending", "Esta declaração já foi respondida.");
  }
  await notify(otherId, sharedFundResolved({ name: (await loadLedger(personId)).personNames.get(personId) ?? "Alguém", result: "declined" }));
}

/** Either of the two undoes an active arrangement; what was registered while it lasted stays as it was. */
export async function endFund(personId: string, fundId: string): Promise<void> {
  const { row, otherId } = await loadFor(personId, fundId);
  if (row.status !== "active") {
    throw new DomainError("shared_fund_not_active", "Só dá para desfazer uma declaração que já foi aceita.");
  }
  const ended = await getDb()
    .update(sharedFunds)
    .set({ status: "ended", endedAt: new Date(), endedBy: personId })
    .where(and(eq(sharedFunds.id, fundId), eq(sharedFunds.status, "active")))
    .returning({ id: sharedFunds.id });
  if (ended.length === 0) {
    throw new DomainError("shared_fund_not_active", "Só dá para desfazer uma declaração que já foi aceita.");
  }
  await notify(otherId, sharedFundResolved({ name: (await loadLedger(personId)).personNames.get(personId) ?? "Alguém", result: "ended" }));
}

/** Whether the two share the same money right now: they do not pay each other. */
export async function areSharingNow(personId: string, otherId: string): Promise<boolean> {
  const ledger = await loadLedger(personId);
  const now = new Date();
  return ledger.funds.some(
    (fund) => fund.endedAt === null && fund.acceptedAt <= now && ((fund.personA === personId && fund.personB === otherId) || (fund.personA === otherId && fund.personB === personId)),
  );
}
