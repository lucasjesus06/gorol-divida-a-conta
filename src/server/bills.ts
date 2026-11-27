import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { billClaims, billItems, billPayers, consumptionBills } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import {
  claimItem as claimItemDomain,
  openConsumptionBill,
  remainingQuantity,
  toItemizedSplit,
  type ConsumptionBill,
} from "@/domain/consumption-bill";
import { assertBillOpen, assertCanClaimFor, assertCanCloseBill } from "@/domain/consumption-bill-access";
import { createExpense } from "@/domain/expense";
import { assertCanRegisterExpense, assertPayersAllowed, assertPeopleInOuting } from "@/domain/expense-access";
import { Fraction } from "@/domain/fraction";
import { billPartTransferred } from "@/domain/notification";
import type { BillStatus } from "@/domain/bill-status";
import { assertActiveOuting, insertVersion, outingContext, type Tx } from "./expenses";
import { notify } from "./push";

export type BillInput = {
  description: string;
  occurredAt: Date;
  serviceChargeCents: number;
  discountCents: number;
  items: { description: string; totalCents: number; quantity: string }[];
  payers: { personId: string; amountCents: number }[];
  idempotencyKey?: string;
};

export type BillView = {
  id: string;
  description: string;
  status: BillStatus;
  occurredAt: Date;
  openedBy: { id: string; name: string };
  totalCents: number;
  serviceChargeCents: number;
  discountCents: number;
  payers: { personId: string; name: string; amountCents: number }[];
  items: {
    id: string;
    description: string;
    totalCents: number;
    quantity: string;
    remaining: string;
    claims: { personId: string; name: string; quantity: string }[];
  }[];
  leftoverTo: { id: string; name: string } | null;
  resultExpenseId: string | null;
  canClose: boolean;
  mustAcceptLeftover: boolean;
};

export type Leftover = { mode: "spread" } | { mode: "transfer"; personId: string };

function translate(error: unknown): never {
  const text = `${(error as Error)?.message ?? ""} ${(error as { cause?: Error })?.cause?.message ?? ""}`;
  if (text.includes("item_over_claimed")) {
    throw new DomainError("item_over_claimed", "Não sobrou essa quantidade para marcar. Atualize a tela e tente de novo.");
  }
  if (text.includes("bill_not_open")) {
    throw new DomainError("bill_already_closed", "Esta conta já foi fechada.");
  }
  throw error;
}

async function findByKey(outingId: string, key: string) {
  const [existing] = await getDb()
    .select({ id: consumptionBills.id })
    .from(consumptionBills)
    .where(and(eq(consumptionBills.outingId, outingId), eq(consumptionBills.idempotencyKey, key)));
  return existing?.id ?? null;
}

export async function openBill(personId: string, outingId: string, input: BillInput): Promise<string> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  assertCanRegisterExpense(context.outing.role, context.declaredIds.has(personId));

  if (input.idempotencyKey) {
    const existing = await findByKey(outingId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }

  const items = input.items.map((item, index) => ({
    id: `item-${index}`,
    description: item.description.trim(),
    totalCents: item.totalCents,
    quantity: Fraction.parse(item.quantity),
  }));
  openConsumptionBill({ source: "manual", items, serviceChargeCents: input.serviceChargeCents, discountCents: input.discountCents });
  if (input.description.trim() === "") {
    throw new DomainError("description_required", "Informe a descrição da despesa.");
  }
  const total = items.reduce((sum, item) => sum + item.totalCents, 0) + input.serviceChargeCents - input.discountCents;
  const paid = input.payers.reduce((sum, payer) => sum + payer.amountCents, 0);
  if (paid !== total) {
    throw new DomainError("payers_total_mismatch", `A soma dos pagamentos (${paid}) é diferente do total da conta (${total}).`);
  }
  assertPayersAllowed(input.payers.map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents })), context.allowedPayerIds);
  assertPeopleInOuting(new Set(input.payers.map((payer) => payer.personId)), context.participantIds);

  const billId = crypto.randomUUID();
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(consumptionBills).values({
        id: billId,
        outingId,
        description: input.description.trim(),
        openedBy: personId,
        occurredAt: input.occurredAt,
        serviceChargeCents: input.serviceChargeCents,
        discountCents: input.discountCents,
        idempotencyKey: input.idempotencyKey,
      });
      await tx.insert(billPayers).values(input.payers.map((payer) => ({ billId, personId: payer.personId, amountCents: payer.amountCents })));
      await tx.insert(billItems).values(
        items.map((item, position) => ({
          billId,
          position,
          description: item.description,
          totalCents: item.totalCents,
          quantityNum: Number(item.quantity.numerator),
          quantityDen: Number(item.quantity.denominator),
        })),
      );
    });
  } catch (error) {
    const existing = input.idempotencyKey ? await findByKey(outingId, input.idempotencyKey) : null;
    if (existing) {
      return existing;
    }
    throw error;
  }
  return billId;
}

type Reader = Pick<ReturnType<typeof getDb>, "select">;

async function loadBill(outingId: string, billId: string, names: Map<string, string>, reader: Reader = getDb()) {
  const [bill] = await reader.select().from(consumptionBills).where(and(eq(consumptionBills.id, billId), eq(consumptionBills.outingId, outingId)));
  if (!bill) {
    throw new DomainError("bill_not_found", "Conta não encontrada.");
  }
  const [payers, items] = await Promise.all([
    reader.select().from(billPayers).where(eq(billPayers.billId, billId)),
    reader.select().from(billItems).where(eq(billItems.billId, billId)).orderBy(asc(billItems.position)),
  ]);
  const claims = items.length === 0 ? [] : await reader.select().from(billClaims).where(inArray(billClaims.itemId, items.map((item) => item.id)));

  const domain: ConsumptionBill = {
    source: "manual",
    serviceChargeCents: bill.serviceChargeCents,
    discountCents: bill.discountCents,
    items: items.map((item) => ({ id: item.id, description: item.description, totalCents: item.totalCents, quantity: Fraction.of(item.quantityNum, item.quantityDen) })),
    claims: new Map(
      items.map((item) => [
        item.id,
        new Map(claims.filter((claim) => claim.itemId === item.id).map((claim) => [claim.personId, Fraction.of(claim.quantityNum, claim.quantityDen)])),
      ]),
    ),
  };
  return { bill, payers, items, claims, domain, nameOf: (id: string) => names.get(id) ?? "Pessoa" };
}

function toView(
  loaded: Awaited<ReturnType<typeof loadBill>>,
  personId: string,
  role: "admin" | "member",
): BillView {
  const { bill, payers, items, claims, domain, nameOf } = loaded;
  const total = items.reduce((sum, item) => sum + item.totalCents, 0) + bill.serviceChargeCents - bill.discountCents;
  return {
    id: bill.id,
    description: bill.description,
    status: bill.status,
    occurredAt: bill.occurredAt,
    openedBy: { id: bill.openedBy, name: nameOf(bill.openedBy) },
    totalCents: total,
    serviceChargeCents: bill.serviceChargeCents,
    discountCents: bill.discountCents,
    payers: payers.map((payer) => ({ personId: payer.personId, name: nameOf(payer.personId), amountCents: payer.amountCents })),
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      totalCents: item.totalCents,
      quantity: Fraction.of(item.quantityNum, item.quantityDen).toText(),
      remaining: remainingQuantity(domain, item.id).toText(),
      claims: claims
        .filter((claim) => claim.itemId === item.id)
        .map((claim) => ({ personId: claim.personId, name: nameOf(claim.personId), quantity: Fraction.of(claim.quantityNum, claim.quantityDen).toText() })),
    })),
    leftoverTo: bill.leftoverTo ? { id: bill.leftoverTo, name: nameOf(bill.leftoverTo) } : null,
    resultExpenseId: bill.resultExpenseId,
    canClose: bill.status !== "closed" && (bill.openedBy === personId || role === "admin"),
    mustAcceptLeftover: bill.status === "closing" && bill.leftoverTo === personId,
  };
}

export async function listBills(personId: string, outingId: string): Promise<BillView[]> {
  const context = await outingContext(personId, outingId);
  const rows = await getDb().select({ id: consumptionBills.id }).from(consumptionBills).where(eq(consumptionBills.outingId, outingId)).orderBy(desc(consumptionBills.createdAt));
  return Promise.all(rows.map(async (row) => toView(await loadBill(outingId, row.id, context.names), personId, context.outing.role)));
}

export async function getBill(personId: string, outingId: string, billId: string): Promise<BillView> {
  const context = await outingContext(personId, outingId);
  return toView(await loadBill(outingId, billId, context.names), personId, context.outing.role);
}

export async function claimItem(
  personId: string,
  outingId: string,
  billId: string,
  itemId: string,
  input: { quantity: string; sharedWith?: string[]; forPersonId?: string },
) {
  const context = await outingContext(personId, outingId);
  const target = input.forPersonId ?? personId;
  assertCanClaimFor(target, personId, context.outing.role);
  const loaded = await loadBill(outingId, billId, context.names);
  assertBillOpen(loaded.bill.status === "open" ? "open" : "closed");

  const group = [...new Set([target, ...(input.sharedWith ?? [])])];
  assertPeopleInOuting(new Set(group), context.participantIds);
  const total = Fraction.parse(input.quantity);
  const each = Fraction.of(total.numerator, total.denominator * BigInt(group.length));

  let bill = loaded.domain;
  for (const person of group) {
    const already = loaded.claims.some((claim) => claim.itemId === itemId && claim.personId === person);
    if (person !== target && already) {
      throw new DomainError("already_claimed_by_other", `${loaded.nameOf(person)} já marcou este item.`);
    }
    bill = claimItemDomain(bill, itemId, person, each);
  }

  try {
    await getDb().transaction(async (tx) => {
      for (const person of group) {
        await tx
          .insert(billClaims)
          .values({ itemId, personId: person, quantityNum: Number(each.numerator), quantityDen: Number(each.denominator), markedBy: personId })
          .onConflictDoUpdate({
            target: [billClaims.itemId, billClaims.personId],
            set: { quantityNum: Number(each.numerator), quantityDen: Number(each.denominator), markedBy: personId },
          });
      }
    });
  } catch (error) {
    translate(error);
  }
}

export async function releaseClaim(personId: string, outingId: string, billId: string, itemId: string, forPersonId?: string) {
  const context = await outingContext(personId, outingId);
  const target = forPersonId ?? personId;
  assertCanClaimFor(target, personId, context.outing.role);
  const loaded = await loadBill(outingId, billId, context.names);
  assertBillOpen(loaded.bill.status === "open" ? "open" : "closed");
  try {
    await getDb().delete(billClaims).where(and(eq(billClaims.itemId, itemId), eq(billClaims.personId, target)));
  } catch (error) {
    translate(error);
  }
}

async function finalize(tx: Tx, outingId: string, billId: string, leftover: Leftover, context: Awaited<ReturnType<typeof outingContext>>) {
  const loaded = await loadBill(outingId, billId, context.names, tx);
  const { bill, domain } = loaded;
  const everyone = context.participants.map((participant) => participant.personId);

  const claims = new Map(domain.claims);
  for (const item of domain.items) {
    const remaining = remainingQuantity(domain, item.id);
    if (remaining.isZero()) {
      continue;
    }
    const merged = new Map(claims.get(item.id));
    if (leftover.mode === "spread") {
      const part = Fraction.of(remaining.numerator, remaining.denominator * BigInt(everyone.length));
      for (const person of everyone) {
        merged.set(person, (merged.get(person) ?? Fraction.ZERO).add(part));
      }
    } else {
      merged.set(leftover.personId, (merged.get(leftover.personId) ?? Fraction.ZERO).add(remaining));
    }
    claims.set(item.id, merged);
  }

  const split = toItemizedSplit({ ...domain, claims });
  const expense = createExpense({
    id: crypto.randomUUID(),
    outingId,
    description: bill.description,
    totalCents: domain.items.reduce((sum, item) => sum + item.totalCents, 0) + bill.serviceChargeCents - bill.discountCents,
    payers: loaded.payers.map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents })),
    split,
    registeredBy: bill.openedBy,
    occurredAt: bill.occurredAt,
    createdAt: new Date(),
  });
  await insertVersion(tx, outingId, bill.openedBy, expense, undefined);
  await tx
    .update(consumptionBills)
    .set({
      status: "closed",
      closedAt: new Date(),
      resultExpenseId: expense.id,
      leftoverMode: leftover.mode,
      leftoverTo: leftover.mode === "transfer" ? leftover.personId : null,
    })
    .where(eq(consumptionBills.id, billId));
  return expense.id;
}

export async function closeBill(personId: string, outingId: string, billId: string, leftover: Leftover): Promise<{ status: "closed" | "awaiting_acceptance" }> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const loaded = await loadBill(outingId, billId, context.names);
  assertBillOpen(loaded.bill.status === "open" ? "open" : "closed");
  assertCanCloseBill(loaded.bill.openedBy, personId, context.outing.role);
  if (leftover.mode === "transfer" && !context.participantIds.has(leftover.personId)) {
    throw new DomainError("person_not_in_outing", "Todas as pessoas da despesa precisam participar do rolê.");
  }

  if (leftover.mode === "transfer" && leftover.personId !== personId) {
    await asService(() =>
      getDb()
        .update(consumptionBills)
        .set({ status: "closing", leftoverMode: "transfer", leftoverTo: leftover.personId })
        .where(and(eq(consumptionBills.id, billId), eq(consumptionBills.status, "open"))),
    );
    await notify(
      leftover.personId,
      billPartTransferred({
        fromName: context.names.get(personId) ?? "Alguém",
        billName: loaded.bill.description,
        outingId,
        billId,
      }),
    );
    return { status: "awaiting_acceptance" };
  }

  await asService(() => getDb().transaction((tx) => finalize(tx, outingId, billId, leftover, context)));
  return { status: "closed" };
}

export async function answerLeftover(personId: string, outingId: string, billId: string, accept: boolean) {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const loaded = await loadBill(outingId, billId, context.names);
  const { bill } = loaded;
  if (bill.status !== "closing" || !bill.leftoverTo) {
    throw new DomainError("nothing_to_accept", "Não há parte esperando resposta nesta conta.");
  }
  const mayAnswer = accept
    ? bill.leftoverTo === personId
    : bill.leftoverTo === personId || bill.openedBy === personId || context.outing.role === "admin";
  if (!mayAnswer) {
    throw new DomainError("not_the_recipient", "Esta parte não foi transferida para você.");
  }

  if (!accept) {
    await asService(() =>
      getDb()
        .update(consumptionBills)
        .set({ status: "open", leftoverMode: null, leftoverTo: null })
        .where(and(eq(consumptionBills.id, billId), eq(consumptionBills.status, "closing"))),
    );
    return;
  }
  await asService(() => getDb().transaction((tx) => finalize(tx, outingId, billId, { mode: "transfer", personId }, context)));
}
