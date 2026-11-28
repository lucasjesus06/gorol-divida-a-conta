import type { ParticipantBalance } from "./outing-balance";
import type { Amnesty } from "./amnesty";
import { pairStatement } from "./pair-statement";
import type { Expense } from "./expense";
import type { Cents } from "./money";
import type { Payment } from "./payment";
import { liveFundPairs, type SharedFund } from "./shared-fund";

export type Transfer = {
  fromId: string;
  toId: string;
  amountCents: Cents;
};

/** Above this many people with open balances, exact minimization gets too expensive. */
const EXACT_SEARCH_LIMIT = 16;

/**
 * Balance used to plan the route: declared payments are treated as already done,
 * so nobody is told to pay again while waiting for the creditor's confirmation.
 */
export function projectedNet(balance: ParticipantBalance): Cents {
  return (
    balance.netCents +
    balance.awaitingConfirmationSentCents -
    balance.awaitingConfirmationReceivedCents
  );
}

/**
 * "Rota inteligente": settles an outing with the fewest Pix transfers.
 *
 * Nobody needs to pay the person who originally paid the expense; only the final
 * balances matter. Finding the true minimum means splitting people into as many
 * groups as possible whose balances cancel out, each group needing (size - 1)
 * transfers. That search is exact up to EXACT_SEARCH_LIMIT people with open
 * balances; above it, largest debtor pays largest creditor (at most n - 1 transfers).
 */
export function smartRoute(balances: Iterable<ParticipantBalance>): Transfer[] {
  const open = [...balances]
    .map((balance) => ({ id: balance.participantId, net: projectedNet(balance) }))
    .filter((entry) => entry.net !== 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const groups = open.length <= EXACT_SEARCH_LIMIT ? zeroSumGroups(open) : [open];
  return groups.flatMap((group) => settleGroup(group));
}

/** Partitions the balances into the largest number of groups that each sum to zero. */
function zeroSumGroups(
  open: Array<{ id: string; net: Cents }>,
): Array<Array<{ id: string; net: Cents }>> {
  const size = open.length;
  const full = (1 << size) - 1;
  const sum = new Array<number>(full + 1).fill(0);
  const best = new Array<number>(full + 1).fill(0);

  for (let mask = 1; mask <= full; mask += 1) {
    const lowest = mask & -mask;
    const index = 31 - Math.clz32(lowest);
    sum[mask] = (sum[mask ^ lowest] as number) + (open[index] as { net: Cents }).net;
    let max = 0;
    for (let bit = 0; bit < size; bit += 1) {
      if (mask & (1 << bit)) {
        max = Math.max(max, best[mask ^ (1 << bit)] as number);
      }
    }
    best[mask] = max + (sum[mask] === 0 ? 1 : 0);
  }

  // Walk back from the full set; every zero-sum mask on the path closes a group.
  const groups: Array<Array<{ id: string; net: Cents }>> = [];
  let current: Array<{ id: string; net: Cents }> = [];
  let mask = full;
  while (mask !== 0) {
    const closesGroup = sum[mask] === 0 ? 1 : 0;
    for (let bit = 0; bit < size; bit += 1) {
      if (!(mask & (1 << bit))) continue;
      const rest = mask ^ (1 << bit);
      if ((best[rest] as number) + closesGroup === best[mask]) {
        current.push(open[bit] as { id: string; net: Cents });
        mask = rest;
        if (sum[mask] === 0) {
          groups.push(current);
          current = [];
        }
        break;
      }
    }
  }
  return groups;
}

/** Settles a group whose balances add up to zero: largest debtor pays largest creditor. */
function settleGroup(group: Array<{ id: string; net: Cents }>): Transfer[] {
  const debtors = group
    .filter((entry) => entry.net < 0)
    .map((entry) => ({ ...entry, net: -entry.net }));
  const creditors = group.filter((entry) => entry.net > 0).map((entry) => ({ ...entry }));
  const byAmountThenId = (a: { id: string; net: Cents }, b: { id: string; net: Cents }) =>
    b.net - a.net || (a.id < b.id ? -1 : 1);

  const transfers: Transfer[] = [];
  while (debtors.length > 0 && creditors.length > 0) {
    debtors.sort(byAmountThenId);
    creditors.sort(byAmountThenId);
    const debtor = debtors[0] as { id: string; net: Cents };
    const creditor = creditors[0] as { id: string; net: Cents };
    const amount = Math.min(debtor.net, creditor.net);
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents: amount });
    debtor.net -= amount;
    creditor.net -= amount;
    if (debtor.net === 0) debtors.shift();
    if (creditor.net === 0) creditors.shift();
  }
  return transfers;
}

/**
 * "Rota manual": each person pays directly whoever they owe from the expenses,
 * only netting what two people owe each other inside the same outing.
 */
export function manualRoute(
  outingId: string,
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[] = [],
  funds: SharedFund[] = [],
): Transfer[] {
  const outingExpenses = expenses.filter((expense) => expense.outingId === outingId);
  const outingPayments = payments.filter((payment) => payment.outingId === outingId);
  const outingAmnesties = amnesties.map((amnesty) => ({ ...amnesty, items: amnesty.items.filter((item) => item.outingId === outingId) }));

  const people = new Set<string>();
  for (const expense of outingExpenses) {
    for (const payer of expense.payers) people.add(payer.participantId);
    for (const participantId of expense.shares.keys()) people.add(participantId);
  }
  const ordered = [...people].sort();

  const transfers: Transfer[] = [];
  for (let i = 0; i < ordered.length; i += 1) {
    for (let j = i + 1; j < ordered.length; j += 1) {
      const a = ordered[i] as string;
      const b = ordered[j] as string;
      const statement = pairStatement(a, b, outingExpenses, outingPayments, outingAmnesties, funds);
      const owedToA = statement.projectedNetByOutingCents.get(outingId) ?? 0;
      if (owedToA > 0) transfers.push({ fromId: b, toId: a, amountCents: owedToA });
      if (owedToA < 0) transfers.push({ fromId: a, toId: b, amountCents: -owedToA });
    }
  }
  return transfers;
}

export type RouteSummary = {
  /** What each person still pays (negative) or receives (positive) in total. */
  netByParticipant: Map<string, Cents>;
  smartTransfers: Transfer[];
  manualTransfers: Transfer[];
  /** How many Pix the smart route saves compared to the manual one. */
  transfersSaved: number;
  /** Pairs who share the same money and would have had to pay each other: the route leaves that transfer out. */
  sharedFundNotices: [string, string][];
};

/** Everything the payer needs to understand the smart route before choosing it. */
export function summarizeRoutes(
  outingId: string,
  balances: Iterable<ParticipantBalance>,
  expenses: Expense[],
  payments: Payment[],
  amnesties: Amnesty[] = [],
  funds: SharedFund[] = [],
  now: Date = new Date(),
): RouteSummary {
  const list = [...balances];
  const { transfers: smartTransfers, avoided } = smartRouteWithFunds(list, funds, now);
  const manualTransfers = manualRoute(outingId, expenses, payments, amnesties, funds);
  return {
    netByParticipant: new Map(
      list.map((balance) => [balance.participantId, projectedNet(balance)]),
    ),
    smartTransfers,
    manualTransfers,
    transfersSaved: Math.max(manualTransfers.length - smartTransfers.length, 0),
    sharedFundNotices: avoided,
  };
}

/** Other outings where the person still owes money, to suggest settling them too. */
export function otherOutingsWithDebt(
  participantId: string,
  currentOutingId: string,
  balancesByOuting: Map<string, Map<string, ParticipantBalance>>,
): Array<{ outingId: string; owedCents: Cents }> {
  const result: Array<{ outingId: string; owedCents: Cents }> = [];
  for (const [outingId, balances] of balancesByOuting) {
    if (outingId === currentOutingId) continue;
    const balance = balances.get(participantId);
    if (balance && projectedNet(balance) < 0) {
      result.push({ outingId, owedCents: -projectedNet(balance) });
    }
  }
  return result;
}

/**
 * The smart route when some people share the same money: each such pair is settled as one person, so
 * nobody is told to pay the one they share money with, and what the pair pays or receives is split
 * between the two (whoever owes most pays first, whoever is owed most receives first).
 */
export function smartRouteWithFunds(
  balances: ParticipantBalance[],
  funds: SharedFund[],
  now: Date,
): { transfers: Transfer[]; avoided: [string, string][] } {
  const present = new Map(balances.map((balance) => [balance.participantId, projectedNet(balance)]));
  const pairs = liveFundPairs(funds, now).filter(([a, b]) => present.has(a) && present.has(b));
  const plain = smartRoute(balances);
  if (pairs.length === 0) {
    return { transfers: plain, avoided: [] };
  }

  const avoided = pairs.filter(([a, b]) => plain.some((transfer) => (transfer.fromId === a && transfer.toId === b) || (transfer.fromId === b && transfer.toId === a)));

  const groupOf = new Map<string, [string, string]>();
  for (const pair of pairs) {
    groupOf.set(pair[0], pair);
    groupOf.set(pair[1], pair);
  }
  const keyOf = (id: string) => {
    const pair = groupOf.get(id);
    return pair ? `fund:${pair[0]}:${pair[1]}` : id;
  };
  const merged = new Map<string, ParticipantBalance>();
  for (const balance of balances) {
    const key = keyOf(balance.participantId);
    const net = projectedNet(balance);
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, netCents: existing.netCents + net } : { ...balance, participantId: key, netCents: net, awaitingConfirmationSentCents: 0, awaitingConfirmationReceivedCents: 0 });
  }

  // How much of what a merged pair pays (or receives) each of the two takes, the one with most to pay (or receive) first.
  const portions = (key: string, amount: Cents, paying: boolean): { id: string; cents: Cents }[] => {
    const pair = [...groupOf.values()].find((candidate) => `fund:${candidate[0]}:${candidate[1]}` === key);
    if (!pair) return [{ id: key, cents: amount }];
    const ordered = [...pair].sort((x, y) => {
      const nx = present.get(x) ?? 0;
      const ny = present.get(y) ?? 0;
      return paying ? nx - ny || (x < y ? -1 : 1) : ny - nx || (x < y ? -1 : 1);
    });
    const first = ordered[0] as string;
    const second = ordered[1] as string;
    const firstNet = present.get(first) ?? 0;
    const firstCapacity = Math.max(paying ? -firstNet : firstNet, 0);
    const firstCents = Math.min(amount, firstCapacity);
    const result = [{ id: first, cents: firstCents }, { id: second, cents: amount - firstCents }];
    return result.filter((portion) => portion.cents > 0);
  };

  const transfers: Transfer[] = [];
  for (const transfer of smartRoute([...merged.values()])) {
    const senders = portions(transfer.fromId, transfer.amountCents, true);
    const receivers = portions(transfer.toId, transfer.amountCents, false);
    let s = 0;
    let r = 0;
    const left = senders.map((portion) => portion.cents);
    const owed = receivers.map((portion) => portion.cents);
    while (s < senders.length && r < receivers.length) {
      const amount = Math.min(left[s] as number, owed[r] as number);
      transfers.push({ fromId: (senders[s] as { id: string }).id, toId: (receivers[r] as { id: string }).id, amountCents: amount });
      left[s] = (left[s] as number) - amount;
      owed[r] = (owed[r] as number) - amount;
      if (left[s] === 0) s += 1;
      if (owed[r] === 0) r += 1;
    }
  }
  return { transfers, avoided };
}
