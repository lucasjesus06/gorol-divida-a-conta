import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { amnestyItems, amnesties, expensePayers, expenseShares, expenses, outingParticipants, outings, payments, people } from "@/db/schema";
import type { Amnesty } from "@/domain/amnesty";
import type { Expense } from "@/domain/expense";
import { computeOutingBalances, debtSummary, type DebtSummary, type ParticipantBalance } from "@/domain/outing-balance";
import { pairStatement, type PairEntry } from "@/domain/pair-statement";
import type { Payment } from "@/domain/payment";
import {
  otherOutingsWithDebt,
  projectedNet,
  summarizeRoutes,
  type Transfer,
} from "@/domain/settlement-routes";
import { DomainError } from "@/domain/domain-error";
import { readOutingContext } from "./expenses";

type AmnestyRow = { id: string; creditorId: string; debtorId: string; createdAt: Date; outingId: string; expenseId: string; amountCents: number };

export function groupAmnesties(rows: AmnestyRow[]): Amnesty[] {
  const byId = new Map<string, Amnesty>();
  for (const row of rows) {
    const amnesty = byId.get(row.id) ?? { id: row.id, creditorId: row.creditorId, debtorId: row.debtorId, createdAt: row.createdAt, items: [] };
    amnesty.items.push({ outingId: row.outingId, expenseId: row.expenseId, amountCents: row.amountCents });
    byId.set(row.id, amnesty);
  }
  return [...byId.values()];
}

export type Ledger = {
  outingNames: Map<string, string>;
  personNames: Map<string, string>;
  expenses: Expense[];
  payments: Payment[];
  /** Every amnesty on these outings: the balances need them all, even those between other people. */
  amnesties: Amnesty[];
};

export async function loadLedger(personId: string, onlyOutingId?: string): Promise<Ledger> {
  const mine = await getDb()
    .select({ outingId: outingParticipants.outingId })
    .from(outingParticipants)
    .where(and(eq(outingParticipants.personId, personId), isNotNull(outingParticipants.confirmedAt), isNull(outingParticipants.leftAt)));
  return loadLedgerForOutings(mine.map((row) => row.outingId).filter((id) => !onlyOutingId || id === onlyOutingId));
}

/** Everything the balances need for these outings; the caller decides which ones the reader may see. */
export async function loadLedgerForOutings(outingIds: string[]): Promise<Ledger> {
  if (outingIds.length === 0) {
    return { outingNames: new Map(), personNames: new Map(), expenses: [], payments: [], amnesties: [] };
  }

  const [outingRows, participantRows, expenseRows, paymentRows, amnestyRows] = await Promise.all([
    getDb().select({ id: outings.id, name: outings.name }).from(outings).where(inArray(outings.id, outingIds)),
    getDb()
      .select({ personId: outingParticipants.personId, name: outingParticipants.displayName })
      .from(outingParticipants)
      .where(and(inArray(outingParticipants.outingId, outingIds), isNotNull(outingParticipants.confirmedAt)))
      .orderBy(desc(outingParticipants.joinedAt)),
    getDb().select().from(expenses).where(and(inArray(expenses.outingId, outingIds), eq(expenses.status, "active"))),
    getDb().select().from(payments).where(inArray(payments.outingId, outingIds)),
    // A forgiven debt changes everyone's route, so the amounts are read for the whole outing; the detail stays with the two people.
    asService(() =>
      getDb()
        .select({
          id: amnesties.id,
          creditorId: amnesties.creditorId,
          debtorId: amnesties.debtorId,
          createdAt: amnesties.createdAt,
          outingId: amnestyItems.outingId,
          expenseId: amnestyItems.expenseId,
          amountCents: amnestyItems.amountCents,
        })
        .from(amnestyItems)
        .innerJoin(amnesties, eq(amnesties.id, amnestyItems.amnestyId))
        .where(inArray(amnestyItems.outingId, outingIds)),
    ),
  ]);
  const expenseIds = expenseRows.map((row) => row.id);
  const [payerRows, shareRows] =
    expenseIds.length === 0
      ? [[], []]
      : await Promise.all([
          getDb().select().from(expensePayers).where(inArray(expensePayers.expenseId, expenseIds)),
          getDb().select().from(expenseShares).where(inArray(expenseShares.expenseId, expenseIds)),
        ]);

  const personNames = new Map<string, string>();
  for (const row of participantRows) {
    if (!personNames.has(row.personId)) {
      personNames.set(row.personId, row.name);
    }
  }

  return {
    outingNames: new Map(outingRows.map((row) => [row.id, row.name])),
    personNames,
    amnesties: groupAmnesties(amnestyRows),
    expenses: expenseRows.map((row) => {
      const shares = new Map(shareRows.filter((share) => share.expenseId === row.id).map((share) => [share.personId, share.amountCents]));
      return {
        id: row.id,
        outingId: row.outingId,
        version: row.version,
        previousVersionId: row.previousVersionId,
        status: row.status,
        description: row.description,
        totalCents: row.totalCents,
        payers: payerRows.filter((payer) => payer.expenseId === row.id).map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents })),
        split: { method: "exact" as const, shares: [...shares].map(([participantId, amountCents]) => ({ participantId, amountCents })) },
        shares,
        evidence: [],
        registeredBy: row.registeredBy,
        occurredAt: row.occurredAt,
        createdAt: row.createdAt,
        voidedBy: row.voidedBy,
        voidReason: row.voidReason,
      };
    }),
    payments: paymentRows.map((row) => ({
      id: row.id,
      outingId: row.outingId,
      fromId: row.fromId,
      toId: row.toId,
      amountCents: row.amountCents,
      onBehalfOfId: row.onBehalfOfId,
      status: row.status,
      proof: null,
      confirmedBy: row.confirmedBy,
      contestableUntil: null,
      contestReason: null,
      declaredAt: row.declaredAt,
      resolvedAt: row.resolvedAt,
    })),
  };
}

export type OutingBalancesView = {
  balances: { personId: string; name: string; netCents: number; paidCents: number; owedCents: number; sentCents: number; receivedCents: number }[];
  mine: DebtSummary & { netCents: number };
  smart: { fromId: string; from: string; toId: string; to: string; amountCents: number }[];
  manual: { fromId: string; from: string; toId: string; to: string; amountCents: number }[];
  transfersSaved: number;
  otherOutingsWithDebt: { outingId: string; name: string; owedCents: number }[];
};

export async function getOutingBalances(personId: string, outingId: string): Promise<OutingBalancesView> {
  await readOutingContext(personId, outingId);
  const ledger = await loadLedger(personId);
  const outingBalances = computeOutingBalances(outingId, ledger.expenses, ledger.payments, ledger.amnesties);
  const summary = summarizeRoutes(outingId, outingBalances.values(), ledger.expenses, ledger.payments, ledger.amnesties);
  const name = (id: string) => ledger.personNames.get(id) ?? "Pessoa";
  const named = (transfer: Transfer) => ({ fromId: transfer.fromId, from: name(transfer.fromId), toId: transfer.toId, to: name(transfer.toId), amountCents: transfer.amountCents });

  const byOuting = new Map<string, Map<string, ParticipantBalance>>();
  for (const id of ledger.outingNames.keys()) {
    byOuting.set(id, computeOutingBalances(id, ledger.expenses, ledger.payments, ledger.amnesties));
  }
  const mineBalance = outingBalances.get(personId);

  return {
    balances: [...outingBalances.values()].map((balance) => ({
      personId: balance.participantId,
      name: name(balance.participantId),
      netCents: projectedNet(balance),
      paidCents: balance.paidCents,
      owedCents: balance.owedCents,
      sentCents: balance.sentCents,
      receivedCents: balance.receivedCents,
    })),
    mine: mineBalance
      ? { ...debtSummary(mineBalance), netCents: projectedNet(mineBalance) }
      : { originalDebtCents: 0, paidCents: 0, pendingCents: 0, netCents: 0 },
    smart: summary.smartTransfers.map(named),
    manual: summary.manualTransfers.map(named),
    transfersSaved: summary.transfersSaved,
    otherOutingsWithDebt: otherOutingsWithDebt(personId, outingId, byOuting).map((item) => ({
      outingId: item.outingId,
      name: ledger.outingNames.get(item.outingId) ?? "Rolê",
      owedCents: item.owedCents,
    })),
  };
}

export type RelationView = {
  otherId: string;
  name: string;
  isAccount: boolean;
  /** Positive: the other person owes me. Null for people without an account, whose debts stay inside each outing. */
  netCents: number | null;
  byOuting: { outingId: string; outingName: string; netCents: number }[];
};

export async function accountIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const rows = await asService(() =>
    getDb().select({ id: people.id }).from(people).where(and(inArray(people.id, ids), isNotNull(people.userId), isNotNull(people.accountApprovedAt))),
  );
  return new Set(rows.map((row) => row.id));
}

function relationOf(personId: string, otherId: string, ledger: Ledger, accounts: Set<string>): RelationView {
  const statement = pairStatement(personId, otherId, ledger.expenses, ledger.payments, ledger.amnesties);
  const isAccount = accounts.has(otherId) && accounts.has(personId);
  return {
    otherId,
    name: ledger.personNames.get(otherId) ?? "Pessoa",
    isAccount,
    netCents: isAccount ? statement.projectedNetCents : null,
    byOuting: [...statement.projectedNetByOutingCents]
      .filter(([, cents]) => cents !== 0)
      .map(([outingId, netCents]) => ({ outingId, outingName: ledger.outingNames.get(outingId) ?? "Rolê", netCents })),
  };
}

export async function getRelations(personId: string): Promise<RelationView[]> {
  const ledger = await loadLedger(personId);
  const others = [...ledger.personNames.keys()].filter((id) => id !== personId);
  const accounts = await accountIds([personId, ...others]);
  return others
    .map((otherId) => relationOf(personId, otherId, ledger, accounts))
    .filter((relation) => relation.byOuting.length > 0)
    .sort((a, b) => Math.abs(b.netCents ?? 0) - Math.abs(a.netCents ?? 0));
}

export type RelationDetail = RelationView & {
  entries: (PairEntry & { outingName: string; label: string })[];
};

export async function getRelationDetail(personId: string, otherId: string): Promise<RelationDetail> {
  const ledger = await loadLedger(personId);
  if (!ledger.personNames.has(otherId) || otherId === personId) {
    throw new DomainError("person_not_found", "Pessoa não encontrada.");
  }
  const accounts = await accountIds([personId, otherId]);
  const relation = relationOf(personId, otherId, ledger, accounts);
  const statement = pairStatement(personId, otherId, ledger.expenses, ledger.payments, ledger.amnesties);
  return {
    ...relation,
    entries: statement.entries.map((entry) => ({
      ...entry,
      outingName: ledger.outingNames.get(entry.outingId) ?? "Rolê",
      label: entry.kind === "expense" ? entry.description : entry.kind === "payment" ? "Pagamento" : "Dívida perdoada",
    })),
  };
}

/** The net of one relation: across outings for accounts, the sum inside the outings for guests. */
export function relationNet(relation: RelationView): number {
  return relation.netCents ?? relation.byOuting.reduce((sum, item) => sum + item.netCents, 0);
}

export function relationTotals(relations: RelationView[]): { owe: number; receive: number } {
  return relations.reduce(
    (totals, relation) => {
      const net = relationNet(relation);
      return net < 0 ? { ...totals, owe: totals.owe - net } : { ...totals, receive: totals.receive + net };
    },
    { owe: 0, receive: 0 },
  );
}
