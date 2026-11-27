import "server-only";
import { asc, eq, isNotNull } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { expenseDisputes, messageTemplates, outings, people, reminderLog, reminderPauses } from "@/db/schema";
import {
  decideReminder,
  pauseReminders as pauseRemindersDomain,
  type ReminderDecision,
  type ReminderState,
} from "@/domain/charge-reminder";
import { DomainError } from "@/domain/domain-error";
import { paymentReminder } from "@/domain/notification";
import { pairStatement } from "@/domain/pair-statement";
import type { ReminderChannel } from "@/domain/reminder-channels";
import { DEFAULT_TEMPLATES, pickTemplate, renderTemplate, validateTemplates, whatsappLink } from "@/domain/reminder-message";
import { accountIds, loadLedgerForOutings } from "./balances";
import { getMyPixKey } from "./pix";
import { notify } from "./push";

/**
 * The acceptance of the terms of use is not recorded yet (see docs/pendencias.md), so the
 * reminder rule that needs it is satisfied by this fixed date until that story exists.
 */
const TERMS_NOT_ENFORCED_YET = new Date(0);

export type ChargeItem = {
  debtor: { id: string; name: string; phone: string };
  creditor: { id: string; name: string };
  amountCents: number;
  outingNames: string[];
  decision: Exclude<ReminderDecision, { action: "stop" }>;
  sentCount: number;
  lastSentAt: Date | null;
  pausesUsed: number;
  pausedUntil: Date | null;
  /** Ready to open in WhatsApp; only when the reminder can go out now. */
  message: string | null;
  whatsappUrl: string | null;
};

async function loadTemplates(): Promise<string[]> {
  const rows = await getDb().select({ body: messageTemplates.body }).from(messageTemplates).orderBy(asc(messageTemplates.position));
  return rows.length > 0 ? rows.map((row) => row.body) : [...DEFAULT_TEMPLATES];
}

type Pair = { debtorId: string; creditorId: string; amountCents: number; outingIds: string[] };

async function openPairs() {
  const outingRows = await getDb().select({ id: outings.id }).from(outings);
  const ledger = await loadLedgerForOutings(outingRows.map((row) => row.id));
  const accounts = await accountIds([...ledger.personNames.keys()]);
  const ids = [...ledger.personNames.keys()].filter((id) => accounts.has(id)).sort();

  const pairs: Pair[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i] as string;
      const b = ids[j] as string;
      const statement = pairStatement(a, b, ledger.expenses, ledger.payments);
      const net = statement.projectedNetCents;
      if (net === 0) continue;
      const outingIds = [...statement.projectedNetByOutingCents].filter(([, cents]) => cents !== 0).map(([id]) => id);
      pairs.push(net < 0 ? { debtorId: a, creditorId: b, amountCents: -net, outingIds } : { debtorId: b, creditorId: a, amountCents: net, outingIds });
    }
  }
  return { pairs, ledger };
}

async function loadFacts() {
  const [logs, pauses, disputes, phones] = await Promise.all([
    getDb().select().from(reminderLog),
    getDb().select().from(reminderPauses),
    getDb().select({ openedBy: expenseDisputes.openedBy, outingId: expenseDisputes.outingId }).from(expenseDisputes).where(eq(expenseDisputes.status, "open")),
    getDb().select({ id: people.id, phone: people.phone }).from(people).where(isNotNull(people.userId)),
  ]);
  return { logs, pauses, disputes, phones: new Map(phones.map((row) => [row.id, row.phone])) };
}

function stateFor(pair: Pair, facts: Awaited<ReturnType<typeof loadFacts>>): ReminderState {
  const logs = facts.logs.filter((row) => row.debtorId === pair.debtorId && row.creditorId === pair.creditorId);
  const pauses = facts.pauses
    .filter((row) => row.debtorId === pair.debtorId && row.creditorId === pair.creditorId)
    .sort((a, b) => b.pausedAt.getTime() - a.pausedAt.getTime());
  return {
    debtorId: pair.debtorId,
    outingId: pair.outingIds[0] as string,
    pendingCents: pair.amountCents,
    termsAcceptedAt: TERMS_NOT_ENFORCED_YET,
    hasOpenDispute: facts.disputes.some((dispute) => dispute.openedBy === pair.debtorId && pair.outingIds.includes(dispute.outingId)),
    sentAt: logs.map((row) => row.sentAt),
    pausedAt: pauses[0]?.pausedAt ?? null,
    pausedUntil: pauses[0]?.pausedUntil ?? null,
    pausesUsed: pauses.length,
  };
}

/** Who owes whom right now and whether a reminder can go out; the super admin's work list. */
export async function getChargeQueue(now: Date = new Date()): Promise<ChargeItem[]> {
  return asService(async () => {
    const [{ pairs, ledger }, facts, templates] = await Promise.all([openPairs(), loadFacts(), loadTemplates()]);
    const items: ChargeItem[] = [];
    for (const pair of pairs) {
      const state = stateFor(pair, facts);
      const decision = decideReminder(state, now);
      if (decision.action === "stop") continue;

      const debtorName = ledger.personNames.get(pair.debtorId) ?? "Pessoa";
      const creditorName = ledger.personNames.get(pair.creditorId) ?? "Pessoa";
      const phone = facts.phones.get(pair.debtorId) ?? "";
      let message: string | null = null;
      if (decision.action === "send") {
        const pix = await getMyPixKey(pair.creditorId);
        message = renderTemplate(pickTemplate(templates, decision.sequence), {
          debtorName,
          creditorName,
          amountCents: pair.amountCents,
          outingNames: pair.outingIds.map((id) => ledger.outingNames.get(id) ?? "Rolê"),
          pixKey: pix?.display ?? null,
        });
      }
      items.push({
        debtor: { id: pair.debtorId, name: debtorName, phone },
        creditor: { id: pair.creditorId, name: creditorName },
        amountCents: pair.amountCents,
        outingNames: pair.outingIds.map((id) => ledger.outingNames.get(id) ?? "Rolê"),
        decision,
        sentCount: state.sentAt.length,
        lastSentAt: state.sentAt.length > 0 ? new Date(Math.max(...state.sentAt.map((date) => date.getTime()))) : null,
        pausesUsed: state.pausesUsed,
        pausedUntil: state.pausedUntil,
        message,
        whatsappUrl: message && phone ? whatsappLink(phone, message) : null,
      });
    }
    return items.sort((a, b) => Number(b.decision.action === "send") - Number(a.decision.action === "send") || b.amountCents - a.amountCents);
  });
}

async function currentItem(debtorId: string, creditorId: string, now: Date) {
  const item = (await getChargeQueue(now)).find((candidate) => candidate.debtor.id === debtorId && candidate.creditor.id === creditorId);
  if (!item) {
    throw new DomainError("nothing_owed", "Esta pessoa não deve mais nada a quem ia cobrar.");
  }
  return item;
}

/**
 * Records that the reminder went out. The rule is checked again here, at the moment of sending,
 * so a stale screen cannot send a second reminder inside the interval.
 */
export async function recordReminder(
  adminId: string,
  input: { debtorId: string; creditorId: string; channel: ReminderChannel },
  now: Date = new Date(),
): Promise<void> {
  const item = await currentItem(input.debtorId, input.creditorId, now);
  const decision = item.decision;
  if (decision.action !== "send") {
    throw new DomainError("reminder_not_allowed", "Esta cobrança não pode ser enviada agora.");
  }
  await asService(() =>
    getDb().insert(reminderLog).values({
      debtorId: input.debtorId,
      creditorId: input.creditorId,
      sequence: decision.sequence,
      channel: input.channel,
      sentBy: adminId,
      sentAt: now,
    }),
  );
  if (input.channel === "app") {
    await notify(input.debtorId, paymentReminder({ creditorId: input.creditorId, creditorName: item.creditor.name, amountCents: item.amountCents }));
  }
}

/** The debtor asked for a break; the reminders come back when it ends and the debt stays. */
export async function pauseCharges(adminId: string, input: { debtorId: string; creditorId: string }, now: Date = new Date()): Promise<void> {
  const item = await currentItem(input.debtorId, input.creditorId, now);
  const facts = await asService(loadFacts);
  const state = stateFor(
    { debtorId: input.debtorId, creditorId: input.creditorId, amountCents: item.amountCents, outingIds: [] },
    facts,
  );
  const paused = pauseRemindersDomain({ ...state, hasOpenDispute: false }, now);
  await asService(() =>
    getDb().insert(reminderPauses).values({
      debtorId: input.debtorId,
      creditorId: input.creditorId,
      pausedAt: now,
      pausedUntil: paused.pausedUntil as Date,
      registeredBy: adminId,
    }),
  );
}

export async function getTemplates(): Promise<string[]> {
  return asService(loadTemplates);
}

export async function saveTemplates(adminId: string, bodies: string[]): Promise<void> {
  const valid = validateTemplates(bodies);
  await asService(() =>
    getDb().transaction(async (tx) => {
      await tx.delete(messageTemplates);
      await tx.insert(messageTemplates).values(valid.map((body, index) => ({ position: index + 1, body, updatedBy: adminId })));
    }),
  );
}
