import "server-only";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expensePayers, expenseShares, expenses, outingParticipants, outingPayers } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import {
  createExpense,
  reviseExpense as reviseExpenseDomain,
  voidExpense as voidExpenseDomain,
  type Expense,
  type ExpenseStatus,
} from "@/domain/expense";
import {
  assertCanChangeExpense,
  assertCanRegisterExpense,
  assertPayersAllowed,
  assertPeopleInOuting,
  peopleInExpense,
} from "@/domain/expense-access";
import { assertAdmin } from "@/domain/outing-access";
import type { Payer, SplitRule } from "@/domain/split";
import { findOuting } from "./outings";

export type ExpenseInput = {
  description: string;
  totalCents: number;
  payers: { personId: string; amountCents: number }[];
  split: { method: "equal"; personIds: string[] } | { method: "exact"; shares: { personId: string; amountCents: number }[] };
  occurredAt: Date;
  idempotencyKey?: string;
};

export type ExpenseView = {
  id: string;
  version: number;
  status: ExpenseStatus;
  description: string;
  totalCents: number;
  splitMethod: "equal" | "exact";
  occurredAt: Date;
  registeredBy: { id: string; name: string };
  payers: { personId: string; name: string; amountCents: number }[];
  shares: { personId: string; name: string; amountCents: number }[];
  voidReason: string | null;
};

export type ExpenseDetail = ExpenseView & { history: ExpenseView[]; canChange: boolean };

export async function outingContext(personId: string, outingId: string) {
  const outing = await findOuting(personId, outingId);
  const [participants, declared] = await Promise.all([
    getDb()
      .select({ personId: outingParticipants.personId, name: outingParticipants.displayName, role: outingParticipants.role })
      .from(outingParticipants)
      .where(and(eq(outingParticipants.outingId, outingId), isNotNull(outingParticipants.confirmedAt))),
    getDb().select({ personId: outingPayers.personId }).from(outingPayers).where(eq(outingPayers.outingId, outingId)),
  ]);
  const declaredIds = new Set(declared.map((row) => row.personId));
  const allowedPayers = participants.filter((participant) => participant.role === "admin" || declaredIds.has(participant.personId));
  return {
    outing,
    participants,
    names: new Map(participants.map((participant) => [participant.personId, participant.name])),
    participantIds: new Set(participants.map((participant) => participant.personId)),
    declaredIds,
    allowedPayers,
    allowedPayerIds: new Set(allowedPayers.map((participant) => participant.personId)),
  };
}

export function assertActiveOuting(status: string) {
  if (status !== "active") {
    throw new DomainError("outing_closed", "Este rolê já foi encerrado.");
  }
}

export function toDomainInput(input: ExpenseInput): { payers: Payer[]; split: SplitRule } {
  return {
    payers: input.payers.map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents })),
    split:
      input.split.method === "equal"
        ? { method: "equal", participantIds: input.split.personIds }
        : { method: "exact", shares: input.split.shares.map((share) => ({ participantId: share.personId, amountCents: share.amountCents })) },
  };
}

async function loadViews(outingId: string, names: Map<string, string>, only?: string[]) {
  const rows = await getDb()
    .select()
    .from(expenses)
    .where(only ? and(eq(expenses.outingId, outingId), inArray(expenses.id, only)) : eq(expenses.outingId, outingId))
    .orderBy(desc(expenses.occurredAt), desc(expenses.createdAt));
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((row) => row.id);
  const [payers, shares] = await Promise.all([
    getDb().select().from(expensePayers).where(inArray(expensePayers.expenseId, ids)),
    getDb().select().from(expenseShares).where(inArray(expenseShares.expenseId, ids)),
  ]);
  const nameOf = (personId: string) => names.get(personId) ?? "Pessoa";
  return rows.map<ExpenseView>((row) => ({
    id: row.id,
    version: row.version,
    status: row.status,
    description: row.description,
    totalCents: row.totalCents,
    splitMethod: row.splitMethod,
    occurredAt: row.occurredAt,
    registeredBy: { id: row.registeredBy, name: nameOf(row.registeredBy) },
    payers: payers.filter((payer) => payer.expenseId === row.id).map((payer) => ({ personId: payer.personId, name: nameOf(payer.personId), amountCents: payer.amountCents })),
    shares: shares.filter((share) => share.expenseId === row.id).map((share) => ({ personId: share.personId, name: nameOf(share.personId), amountCents: share.amountCents })),
    voidReason: row.voidReason,
  }));
}

export async function listPayers(personId: string, outingId: string) {
  const context = await outingContext(personId, outingId);
  return context.participants.map((participant) => ({
    personId: participant.personId,
    name: participant.name,
    isOwner: participant.role === "admin",
    isPayer: context.allowedPayerIds.has(participant.personId),
  }));
}

export async function declarePayer(personId: string, outingId: string, payerPersonId: string) {
  const context = await outingContext(personId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  assertActiveOuting(context.outing.status);
  if (!context.participantIds.has(payerPersonId)) {
    throw new DomainError("person_not_in_outing", "Todas as pessoas da despesa precisam participar do rolê.");
  }
  if (context.allowedPayerIds.has(payerPersonId)) {
    throw new DomainError("already_payer", "Esta pessoa já é pagante.");
  }
  await getDb().insert(outingPayers).values({ outingId, personId: payerPersonId, declaredBy: personId });
}

export type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export async function insertVersion(tx: Tx, outingId: string, personId: string, expense: Expense, idempotencyKey: string | undefined) {
  await tx.insert(expenses).values({
    id: expense.id,
    outingId,
    version: expense.version,
    previousVersionId: expense.previousVersionId,
    description: expense.description,
    totalCents: expense.totalCents,
    splitMethod: expense.split.method === "equal" ? "equal" : "exact",
    occurredAt: expense.occurredAt,
    registeredBy: personId,
    idempotencyKey,
  });
  await tx
    .insert(expensePayers)
    .values(expense.payers.map((payer) => ({ expenseId: expense.id, personId: payer.participantId, amountCents: payer.amountCents })));
  await tx
    .insert(expenseShares)
    .values([...expense.shares].map(([shareholder, amountCents]) => ({ expenseId: expense.id, personId: shareholder, amountCents })));
}

async function findByKey(outingId: string, key: string) {
  const [existing] = await getDb()
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.outingId, outingId), eq(expenses.idempotencyKey, key)));
  return existing?.id ?? null;
}

export function validate(context: Awaited<ReturnType<typeof outingContext>>, expense: Expense, extraPayerIds: string[] = []) {
  assertPeopleInOuting(peopleInExpense(expense.payers, expense.split), context.participantIds);
  assertPayersAllowed(expense.payers, new Set([...context.allowedPayerIds, ...extraPayerIds]));
}

export async function registerExpense(personId: string, outingId: string, input: ExpenseInput): Promise<string> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  assertCanRegisterExpense(context.outing.role, context.declaredIds.has(personId));

  if (input.idempotencyKey) {
    const existing = await findByKey(outingId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const expense = createExpense({
    id: crypto.randomUUID(),
    outingId,
    description: input.description,
    totalCents: input.totalCents,
    ...toDomainInput(input),
    registeredBy: personId,
    occurredAt: input.occurredAt,
    createdAt: new Date(),
  });
  validate(context, expense);

  try {
    await getDb().transaction(async (tx) => insertVersion(tx, outingId, personId, expense, input.idempotencyKey));
  } catch (error) {
    const existing = input.idempotencyKey ? await findByKey(outingId, input.idempotencyKey) : null;
    if (existing) {
      return existing;
    }
    throw error;
  }
  return expense.id;
}

export async function loadCurrent(outingId: string, expenseId: string, names: Map<string, string>) {
  const [view] = await loadViews(outingId, names, [expenseId]);
  if (!view) {
    throw new DomainError("expense_not_found", "Despesa não encontrada.");
  }
  const split: SplitRule =
    view.splitMethod === "equal"
      ? { method: "equal", participantIds: view.shares.map((share) => share.personId) }
      : { method: "exact", shares: view.shares.map((share) => ({ participantId: share.personId, amountCents: share.amountCents })) };
  const current: Expense = {
    id: view.id,
    outingId,
    version: view.version,
    previousVersionId: null,
    status: view.status,
    description: view.description,
    totalCents: view.totalCents,
    payers: view.payers.map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents })),
    split,
    shares: new Map(view.shares.map((share) => [share.personId, share.amountCents])),
    evidence: [],
    registeredBy: view.registeredBy.id,
    occurredAt: view.occurredAt,
    createdAt: new Date(),
    voidedBy: null,
    voidReason: view.voidReason,
  };
  return current;
}

export async function reviseExpense(personId: string, outingId: string, expenseId: string, input: ExpenseInput): Promise<string> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  assertCanRegisterExpense(context.outing.role, context.declaredIds.has(personId));
  const current = await loadCurrent(outingId, expenseId, context.names);
  assertCanChangeExpense(current.registeredBy, personId, context.outing.role);

  if (input.idempotencyKey) {
    const existing = await findByKey(outingId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const { revision } = reviseExpenseDomain(current, {
    id: crypto.randomUUID(),
    description: input.description,
    totalCents: input.totalCents,
    ...toDomainInput(input),
    registeredBy: personId,
    occurredAt: input.occurredAt,
    createdAt: new Date(),
  });
  validate(context, revision);

  try {
    await getDb().transaction(async (tx) => {
      await insertVersion(tx, outingId, personId, revision, input.idempotencyKey);
      await tx.update(expenses).set({ status: "superseded" }).where(and(eq(expenses.id, current.id), eq(expenses.status, "active")));
    });
  } catch (error) {
    const existing = input.idempotencyKey ? await findByKey(outingId, input.idempotencyKey) : null;
    if (existing) {
      return existing;
    }
    throw error;
  }
  return revision.id;
}

export async function voidExpense(personId: string, outingId: string, expenseId: string, reason: string) {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const current = await loadCurrent(outingId, expenseId, context.names);
  assertCanChangeExpense(current.registeredBy, personId, context.outing.role);
  const voided = voidExpenseDomain(current, personId, reason);

  const changed = await getDb()
    .update(expenses)
    .set({ status: "voided", voidedBy: personId, voidReason: voided.voidReason })
    .where(and(eq(expenses.id, current.id), eq(expenses.status, "active")))
    .returning({ id: expenses.id });
  if (changed.length === 0) {
    throw new DomainError("expense_not_active", "Só é possível alterar ou anular a versão ativa da despesa.");
  }
}

export async function listExpenses(personId: string, outingId: string): Promise<ExpenseView[]> {
  const context = await outingContext(personId, outingId);
  const all = await loadViews(outingId, context.names);
  return all.filter((expense) => expense.status !== "superseded");
}

export async function getExpense(personId: string, outingId: string, expenseId: string): Promise<ExpenseDetail> {
  const context = await outingContext(personId, outingId);
  const [all, links] = await Promise.all([
    loadViews(outingId, context.names),
    getDb().select({ id: expenses.id, previousVersionId: expenses.previousVersionId }).from(expenses).where(eq(expenses.outingId, outingId)),
  ]);
  const byId = new Map(all.map((expense) => [expense.id, expense]));
  const target = byId.get(expenseId);
  if (!target) {
    throw new DomainError("expense_not_found", "Despesa não encontrada.");
  }

  const previousOf = new Map(links.map((link) => [link.id, link.previousVersionId]));
  const history: ExpenseView[] = [];
  for (let cursor = previousOf.get(expenseId) ?? null; cursor; cursor = previousOf.get(cursor) ?? null) {
    const version = byId.get(cursor);
    if (version) {
      history.push(version);
    }
  }
  const canChange = target.status === "active" && (target.registeredBy.id === personId || context.outing.role === "admin");
  return { ...target, history, canChange };
}
