import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { expenses, outingPayers, payerRequestPayers, payerRequestShares, payerRequests } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { createExpense, reviseExpense as reviseExpenseDomain, type Expense } from "@/domain/expense";
import { assertCanChangeExpense } from "@/domain/expense-access";
import { assertAdmin } from "@/domain/outing-access";
import { assertRequesterPays, type PayerRequestStatus } from "@/domain/payer-request";
import {
  assertActiveOuting,
  insertVersion,
  loadCurrent,
  outingContext,
  toDomainInput,
  validate,
  type ExpenseInput,
} from "./expenses";

export type PayerRequestView = {
  id: string;
  targetExpenseId: string | null;
  requestedBy: { id: string; name: string };
  description: string;
  totalCents: number;
  splitMethod: "equal" | "exact";
  occurredAt: Date;
  status: PayerRequestStatus;
  decisionNote: string | null;
  resultExpenseId: string | null;
  createdAt: Date;
  payers: { personId: string; name: string; amountCents: number }[];
  shares: { personId: string; name: string; amountCents: number }[];
};

async function findByKey(outingId: string, key: string) {
  const [existing] = await getDb()
    .select({ id: payerRequests.id })
    .from(payerRequests)
    .where(and(eq(payerRequests.outingId, outingId), eq(payerRequests.idempotencyKey, key)));
  return existing?.id ?? null;
}

export async function createPayerRequest(
  personId: string,
  outingId: string,
  request: { input: ExpenseInput; targetExpenseId?: string },
): Promise<string> {
  const { input } = request;
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  if (context.allowedPayerIds.has(personId)) {
    throw new DomainError("already_payer", "Você já é pagante: registre a despesa direto.");
  }
  assertRequesterPays(toDomainInput(input).payers, personId);

  if (input.idempotencyKey) {
    const existing = await findByKey(outingId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  if (request.targetExpenseId) {
    const target = await loadCurrent(outingId, request.targetExpenseId, context.names);
    if (target.status !== "active") {
      throw new DomainError("expense_not_active", "Só é possível alterar ou anular a versão ativa da despesa.");
    }
  }

  const proposal = createExpense({
    id: crypto.randomUUID(),
    outingId,
    description: input.description,
    totalCents: input.totalCents,
    ...toDomainInput(input),
    registeredBy: personId,
    occurredAt: input.occurredAt,
    createdAt: new Date(),
  });
  validate(context, proposal, [personId]);

  const requestId = crypto.randomUUID();
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(payerRequests).values({
        id: requestId,
        outingId,
        targetExpenseId: request.targetExpenseId ?? null,
        requestedBy: personId,
        description: proposal.description,
        totalCents: proposal.totalCents,
        splitMethod: proposal.split.method === "equal" ? "equal" : "exact",
        occurredAt: proposal.occurredAt,
        idempotencyKey: input.idempotencyKey,
      });
      await tx
        .insert(payerRequestPayers)
        .values(proposal.payers.map((payer) => ({ requestId, personId: payer.participantId, amountCents: payer.amountCents })));
      await tx
        .insert(payerRequestShares)
        .values([...proposal.shares].map(([shareholder, amountCents]) => ({ requestId, personId: shareholder, amountCents })));
    });
  } catch (error) {
    const existing = input.idempotencyKey ? await findByKey(outingId, input.idempotencyKey) : null;
    if (existing) {
      return existing;
    }
    throw error;
  }
  return requestId;
}

export async function listPayerRequests(personId: string, outingId: string): Promise<PayerRequestView[]> {
  const context = await outingContext(personId, outingId);
  const isAdmin = context.outing.role === "admin";
  const rows = await getDb()
    .select()
    .from(payerRequests)
    .where(isAdmin ? eq(payerRequests.outingId, outingId) : and(eq(payerRequests.outingId, outingId), eq(payerRequests.requestedBy, personId)))
    .orderBy(desc(payerRequests.createdAt));
  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((row) => row.id);
  const [payers, shares] = await Promise.all([
    getDb().select().from(payerRequestPayers).where(inArray(payerRequestPayers.requestId, ids)),
    getDb().select().from(payerRequestShares).where(inArray(payerRequestShares.requestId, ids)),
  ]);
  const nameOf = (id: string) => context.names.get(id) ?? "Pessoa";
  return rows.map((row) => ({
    id: row.id,
    targetExpenseId: row.targetExpenseId,
    requestedBy: { id: row.requestedBy, name: nameOf(row.requestedBy) },
    description: row.description,
    totalCents: row.totalCents,
    splitMethod: row.splitMethod,
    occurredAt: row.occurredAt,
    status: row.status,
    decisionNote: row.decisionNote,
    resultExpenseId: row.resultExpenseId,
    createdAt: row.createdAt,
    payers: payers.filter((payer) => payer.requestId === row.id).map((payer) => ({ personId: payer.personId, name: nameOf(payer.personId), amountCents: payer.amountCents })),
    shares: shares.filter((share) => share.requestId === row.id).map((share) => ({ personId: share.personId, name: nameOf(share.personId), amountCents: share.amountCents })),
  }));
}

export async function decidePayerRequest(personId: string, outingId: string, requestId: string, decision: { approve: boolean; note: string }) {
  const context = await outingContext(personId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  assertActiveOuting(context.outing.status);

  const [request] = (await listPayerRequests(personId, outingId)).filter((candidate) => candidate.id === requestId);
  if (!request || request.status !== "pending") {
    throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
  }
  const note = decision.note.trim() === "" ? null : decision.note.trim();

  if (!decision.approve) {
    const rejected = await getDb()
      .update(payerRequests)
      .set({ status: "rejected", decidedBy: personId, decidedAt: new Date(), decisionNote: note })
      .where(and(eq(payerRequests.id, requestId), eq(payerRequests.status, "pending")))
      .returning({ id: payerRequests.id });
    if (rejected.length === 0) {
      throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
    }
    return;
  }

  const input: ExpenseInput = {
    description: request.description,
    totalCents: request.totalCents,
    payers: request.payers.map((payer) => ({ personId: payer.personId, amountCents: payer.amountCents })),
    split:
      request.splitMethod === "equal"
        ? { method: "equal", personIds: request.shares.map((share) => share.personId) }
        : { method: "exact", shares: request.shares.map((share) => ({ personId: share.personId, amountCents: share.amountCents })) },
    occurredAt: request.occurredAt,
  };
  const base = { description: input.description, totalCents: input.totalCents, ...toDomainInput(input), registeredBy: personId, occurredAt: input.occurredAt, createdAt: new Date() };

  let expense: Expense;
  let supersedes: string | null = null;
  if (request.targetExpenseId) {
    const current = await loadCurrent(outingId, request.targetExpenseId, context.names);
    assertCanChangeExpense(current.registeredBy, personId, context.outing.role);
    expense = reviseExpenseDomain(current, { id: crypto.randomUUID(), ...base }).revision;
    supersedes = current.id;
  } else {
    expense = createExpense({ id: crypto.randomUUID(), outingId, ...base });
  }
  validate(context, expense, [request.requestedBy.id]);

  await getDb().transaction(async (tx) => {
    if (!context.allowedPayerIds.has(request.requestedBy.id)) {
      await tx.insert(outingPayers).values({ outingId, personId: request.requestedBy.id, declaredBy: personId });
    }
    await insertVersion(tx, outingId, personId, expense, undefined);
    if (supersedes) {
      await tx.update(expenses).set({ status: "superseded" }).where(and(eq(expenses.id, supersedes), eq(expenses.status, "active")));
    }
    const approved = await tx
      .update(payerRequests)
      .set({ status: "approved", decidedBy: personId, decidedAt: new Date(), decisionNote: note, resultExpenseId: expense.id })
      .where(and(eq(payerRequests.id, requestId), eq(payerRequests.status, "pending")))
      .returning({ id: payerRequests.id });
    if (approved.length === 0) {
      throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
    }
  });
}
