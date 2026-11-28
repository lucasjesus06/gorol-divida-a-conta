import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { billClaims, billItems, billPayers, consumptionBills } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import {
  claimItem as claimItemDomain,
  remainingQuantity,
  toItemizedSplit,
  type ConsumptionBill,
} from "@/domain/consumption-bill";
import {
  billTotalCents,
  planBillClosing,
  validateBillItem,
  validateDirectTotal,
  type BillDivision,
  type BillItemInput,
} from "@/domain/bill-closing";
import { assertBillOpen, assertCanClaimFor, assertCanCloseBill } from "@/domain/consumption-bill-access";
import { createExpense } from "@/domain/expense";
import { assertPeopleInOuting } from "@/domain/expense-access";
import { Fraction } from "@/domain/fraction";
import { billPartTransferred } from "@/domain/notification";
import type { BillMode, BillStatus } from "@/domain/bill-status";
import type { Payer, SplitRule } from "@/domain/split";
import { assertActiveOuting, insertVersion, outingContext, type Tx, readOutingContext } from "./expenses";
import { notify } from "./push";

export type BillInput = {
  description: string;
  occurredAt: Date;
  mode: BillMode;
  /** The typed total of a direct bill. */
  directTotalCents?: number;
  /** Items typed right away, when the person already has them; more can be added while the bill is open. */
  items?: BillItemInput[];
  serviceChargeCents?: number;
  discountCents?: number;
  idempotencyKey?: string;
};

export type BillView = {
  id: string;
  description: string;
  status: BillStatus;
  mode: BillMode;
  occurredAt: Date;
  openedBy: { id: string; name: string };
  /** The total so far: for a bill still open it grows as items are added. */
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
    addedBy: { id: string; name: string };
    /** The person may change or remove it: who typed it, who opened the bill or the owner, while nobody marked it. */
    canEdit: boolean;
    claims: { personId: string; name: string; quantity: string }[];
  }[];
  /** Any participant can add items while the bill is open. */
  canAddItem: boolean;
  /** Payers chosen when the bill was opened by the old flow: they stay, and closing does not ask again. */
  payersFixed: boolean;
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
  if (text.includes("item_has_claims")) {
    throw new DomainError("item_has_claims", "Alguém já marcou este item, então ele não pode mais mudar.");
  }
  if (text.includes("bill_not_balanced")) {
    throw new DomainError("bill_changed", "A conta mudou enquanto era fechada. Confira os valores e tente de novo.");
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

/** Any participant opens a bill; who paid and how it is divided are asked only when it is closed. */
export async function openBill(personId: string, outingId: string, input: BillInput): Promise<string> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);

  if (input.idempotencyKey) {
    const existing = await findByKey(outingId, input.idempotencyKey);
    if (existing) {
      return existing;
    }
  }
  if (input.description.trim() === "") {
    throw new DomainError("description_required", "Informe a descrição da despesa.");
  }
  const service = input.serviceChargeCents ?? 0;
  const discount = input.discountCents ?? 0;
  if (service < 0 || discount < 0) {
    throw new DomainError("amount_negative", "A taxa e o desconto não podem ser negativos.");
  }
  const directTotal = input.mode === "direct" ? validateDirectTotal(input.directTotalCents ?? 0) : null;
  const items = input.mode === "detailed" ? (input.items ?? []).map(validateBillItem) : [];

  const billId = crypto.randomUUID();
  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(consumptionBills).values({
        id: billId,
        outingId,
        description: input.description.trim(),
        mode: input.mode,
        directTotalCents: directTotal,
        openedBy: personId,
        occurredAt: input.occurredAt,
        serviceChargeCents: input.mode === "detailed" ? service : 0,
        discountCents: input.mode === "detailed" ? discount : 0,
        idempotencyKey: input.idempotencyKey,
      });
      if (items.length > 0) {
        await tx.insert(billItems).values(
          items.map((item) => ({
            billId,
            position: 0,
            addedBy: personId,
            description: item.description,
            totalCents: item.totalCents,
            quantityNum: Number(item.quantity.numerator),
            quantityDen: Number(item.quantity.denominator),
          })),
        );
      }
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

async function openDetailedBill(context: Awaited<ReturnType<typeof outingContext>>, outingId: string, billId: string) {
  assertActiveOuting(context.outing.status);
  const loaded = await loadBill(outingId, billId, context.names);
  assertBillOpen(loaded.bill.status === "open" ? "open" : "closed");
  if (loaded.bill.mode !== "detailed") {
    throw new DomainError("bill_without_items_mode", "Esta conta é só de valor: não tem itens para lançar.");
  }
  return loaded;
}

/** Anyone in the outing adds an item while the bill is open; the order and the author are kept. */
export async function addBillItem(personId: string, outingId: string, billId: string, input: BillItemInput): Promise<string> {
  const context = await outingContext(personId, outingId);
  await openDetailedBill(context, outingId, billId);
  const item = validateBillItem(input);
  try {
    const [row] = await getDb()
      .insert(billItems)
      .values({
        billId,
        position: 0,
        addedBy: personId,
        description: item.description,
        totalCents: item.totalCents,
        quantityNum: Number(item.quantity.numerator),
        quantityDen: Number(item.quantity.denominator),
      })
      .returning({ id: billItems.id });
    return row.id;
  } catch (error) {
    translate(error);
  }
}

function assertCanEditItem(loaded: Awaited<ReturnType<typeof loadBill>>, itemId: string, personId: string, role: "admin" | "member") {
  const item = loaded.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new DomainError("item_not_found", "Item não encontrado nesta conta.");
  }
  if (loaded.claims.some((claim) => claim.itemId === itemId)) {
    throw new DomainError("item_has_claims", "Alguém já marcou este item, então ele não pode mais mudar.");
  }
  if (!((item.addedBy ?? loaded.bill.openedBy) === personId || loaded.bill.openedBy === personId || role === "admin")) {
    throw new DomainError("item_not_yours", "Só quem lançou o item, quem abriu a conta ou o dono muda o item.");
  }
}

export async function updateBillItem(personId: string, outingId: string, billId: string, itemId: string, input: BillItemInput) {
  const context = await outingContext(personId, outingId);
  const loaded = await openDetailedBill(context, outingId, billId);
  assertCanEditItem(loaded, itemId, personId, context.outing.role);
  const item = validateBillItem(input);
  try {
    await getDb()
      .update(billItems)
      .set({ description: item.description, totalCents: item.totalCents, quantityNum: Number(item.quantity.numerator), quantityDen: Number(item.quantity.denominator) })
      .where(and(eq(billItems.id, itemId), eq(billItems.billId, billId)));
  } catch (error) {
    translate(error);
  }
}

export async function removeBillItem(personId: string, outingId: string, billId: string, itemId: string) {
  const context = await outingContext(personId, outingId);
  const loaded = await openDetailedBill(context, outingId, billId);
  assertCanEditItem(loaded, itemId, personId, context.outing.role);
  try {
    await getDb().delete(billItems).where(and(eq(billItems.id, itemId), eq(billItems.billId, billId)));
  } catch (error) {
    translate(error);
  }
}

/** The value of a direct bill, or the service charge and discount of a detailed one; only while it is open. */
export async function updateBillAmounts(
  personId: string,
  outingId: string,
  billId: string,
  input: { directTotalCents?: number; serviceChargeCents?: number; discountCents?: number },
) {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const loaded = await loadBill(outingId, billId, context.names);
  assertBillOpen(loaded.bill.status === "open" ? "open" : "closed");
  assertCanCloseBill(loaded.bill.openedBy, personId, context.outing.role);

  const set: { directTotalCents?: number; serviceChargeCents?: number; discountCents?: number } = {};
  if (loaded.bill.mode === "direct") {
    if (input.directTotalCents !== undefined) set.directTotalCents = validateDirectTotal(input.directTotalCents);
  } else {
    for (const [key, value] of [["serviceChargeCents", input.serviceChargeCents], ["discountCents", input.discountCents]] as const) {
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0) {
        throw new DomainError("amount_negative", "A taxa e o desconto não podem ser negativos.");
      }
      set[key] = value;
    }
  }
  if (Object.keys(set).length === 0) {
    return;
  }
  await asService(() => getDb().update(consumptionBills).set(set).where(and(eq(consumptionBills.id, billId), eq(consumptionBills.status, "open"))));
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
  const total = billTotalOf(bill, items);
  const open = bill.status === "open";
  return {
    id: bill.id,
    description: bill.description,
    status: bill.status,
    mode: bill.mode,
    occurredAt: bill.occurredAt,
    openedBy: { id: bill.openedBy, name: nameOf(bill.openedBy) },
    totalCents: total,
    serviceChargeCents: bill.serviceChargeCents,
    discountCents: bill.discountCents,
    payers: payers.map((payer) => ({ personId: payer.personId, name: nameOf(payer.personId), amountCents: payer.amountCents })),
    items: items.map((item) => {
      const addedBy = item.addedBy ?? bill.openedBy;
      const marked = claims.some((claim) => claim.itemId === item.id);
      return {
        id: item.id,
        description: item.description,
        totalCents: item.totalCents,
        quantity: Fraction.of(item.quantityNum, item.quantityDen).toText(),
        remaining: remainingQuantity(domain, item.id).toText(),
        addedBy: { id: addedBy, name: nameOf(addedBy) },
        canEdit: open && !marked && (addedBy === personId || bill.openedBy === personId || role === "admin"),
        claims: claims
          .filter((claim) => claim.itemId === item.id)
          .map((claim) => ({ personId: claim.personId, name: nameOf(claim.personId), quantity: Fraction.of(claim.quantityNum, claim.quantityDen).toText() })),
      };
    }),
    canAddItem: open && bill.mode === "detailed",
    payersFixed: payers.length > 0,
    leftoverTo: bill.leftoverTo ? { id: bill.leftoverTo, name: nameOf(bill.leftoverTo) } : null,
    resultExpenseId: bill.resultExpenseId,
    canClose: bill.status !== "closed" && (bill.openedBy === personId || role === "admin"),
    mustAcceptLeftover: bill.status === "closing" && bill.leftoverTo === personId,
  };
}

/** The total of the bill as it stands: the typed value, or the items so far plus the service charge minus the discount. */
function billTotalOf(bill: { mode: BillMode; directTotalCents: number | null; serviceChargeCents: number; discountCents: number }, items: { totalCents: number }[]): number {
  if (bill.mode === "direct") {
    return bill.directTotalCents ?? 0;
  }
  return items.reduce((sum, item) => sum + item.totalCents, 0) + bill.serviceChargeCents - bill.discountCents;
}

export async function listBills(personId: string, outingId: string): Promise<BillView[]> {
  const context = await readOutingContext(personId, outingId);
  const rows = await getDb().select({ id: consumptionBills.id }).from(consumptionBills).where(eq(consumptionBills.outingId, outingId)).orderBy(desc(consumptionBills.createdAt));
  return Promise.all(rows.map(async (row) => toView(await loadBill(outingId, row.id, context.names), personId, context.outing.role)));
}

export async function getBill(personId: string, outingId: string, billId: string): Promise<BillView> {
  const context = await readOutingContext(personId, outingId);
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

type Closing =
  | { kind: "marks"; leftover: Leftover }
  | { kind: "split"; split: Extract<SplitRule, { method: "equal" | "exact" }> };

/**
 * Writes the expense a closed bill becomes, and closes the bill, in one transaction. The bill row is
 * locked first, so nobody adds an item or closes it twice while this runs.
 */
async function finalize(
  tx: Tx,
  outingId: string,
  billId: string,
  closing: Closing,
  payers: Payer[],
  context: Awaited<ReturnType<typeof outingContext>>,
) {
  await tx.select({ id: consumptionBills.id }).from(consumptionBills).where(eq(consumptionBills.id, billId)).for("update");
  const loaded = await loadBill(outingId, billId, context.names, tx);
  const { bill, domain } = loaded;
  if (bill.status === "closed") {
    throw new DomainError("bill_already_closed", "Esta conta já foi fechada.");
  }
  const everyone = context.participants.map((participant) => participant.personId);
  const total = billTotalCents({
    mode: bill.mode,
    directTotalCents: bill.directTotalCents,
    itemCents: loaded.items.map((item) => item.totalCents),
    serviceChargeCents: bill.serviceChargeCents,
    discountCents: bill.discountCents,
  });
  if (loaded.payers.length === 0) {
    await tx.insert(billPayers).values(payers.map((payer) => ({ billId, personId: payer.participantId, amountCents: payer.amountCents })));
  }

  let split: SplitRule;
  let leftoverMode: Leftover["mode"] | null = null;
  let leftoverTo: string | null = null;
  if (closing.kind === "split") {
    split = closing.split;
  } else {
    const leftover = closing.leftover;
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
    split = toItemizedSplit({ ...domain, claims });
    leftoverMode = leftover.mode;
    leftoverTo = leftover.mode === "transfer" ? leftover.personId : null;
  }

  const expense = createExpense({
    id: crypto.randomUUID(),
    outingId,
    description: bill.description,
    totalCents: total,
    payers: loaded.payers.length > 0 ? loaded.payers.map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents })) : payers,
    split,
    registeredBy: bill.openedBy,
    occurredAt: bill.occurredAt,
    createdAt: new Date(),
  });
  await insertVersion(tx, outingId, bill.openedBy, expense, undefined);
  await tx
    .update(consumptionBills)
    .set({ status: "closed", closedAt: new Date(), resultExpenseId: expense.id, leftoverMode, leftoverTo })
    .where(eq(consumptionBills.id, billId));
  return expense.id;
}

export type CloseBillInput = {
  /** Who paid. Left out when the payers were already chosen by the old flow. */
  payers?: { personId: string; amountCents: number }[];
  division: BillDivision;
  /** What nobody marked, when dividing by what each one consumed. */
  leftover?: Leftover;
};

/**
 * Closes the bill: now it is asked who paid and how to divide. By what each one marked, the part nobody
 * marked is spread or handed to someone, who may have to accept it first; any other division closes at once.
 */
export async function closeBill(personId: string, outingId: string, billId: string, input: CloseBillInput): Promise<{ status: "closed" | "awaiting_acceptance" }> {
  const context = await outingContext(personId, outingId);
  assertActiveOuting(context.outing.status);
  const loaded = await loadBill(outingId, billId, context.names);
  assertBillOpen(loaded.bill.status === "open" ? "open" : "closed");
  assertCanCloseBill(loaded.bill.openedBy, personId, context.outing.role);

  const total = billTotalCents({
    mode: loaded.bill.mode,
    directTotalCents: loaded.bill.directTotalCents,
    itemCents: loaded.items.map((item) => item.totalCents),
    serviceChargeCents: loaded.bill.serviceChargeCents,
    discountCents: loaded.bill.discountCents,
  });
  const payers: Payer[] =
    loaded.payers.length > 0
      ? loaded.payers.map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents }))
      : (input.payers ?? []).map((payer) => ({ participantId: payer.personId, amountCents: payer.amountCents }));
  const plan = planBillClosing({
    mode: loaded.bill.mode,
    totalCents: total,
    payers,
    division: input.division,
    allowedPayerIds: context.allowedPayerIds,
    participantIds: context.participantIds,
  });

  if (!plan.split) {
    const leftover = input.leftover ?? { mode: "spread" as const };
    if (leftover.mode === "transfer" && !context.participantIds.has(leftover.personId)) {
      throw new DomainError("person_not_in_outing", "Todas as pessoas da despesa precisam participar do rolê.");
    }
    if (leftover.mode === "transfer" && leftover.personId !== personId) {
      await asService(() =>
        getDb().transaction(async (tx) => {
          await tx.select({ id: consumptionBills.id }).from(consumptionBills).where(eq(consumptionBills.id, billId)).for("update");
          if (loaded.payers.length === 0) {
            await tx.insert(billPayers).values(plan.payers.map((payer) => ({ billId, personId: payer.participantId, amountCents: payer.amountCents })));
          }
          const moved = await tx
            .update(consumptionBills)
            .set({ status: "closing", leftoverMode: "transfer", leftoverTo: leftover.personId })
            .where(and(eq(consumptionBills.id, billId), eq(consumptionBills.status, "open")))
            .returning({ id: consumptionBills.id });
          if (moved.length === 0) {
            throw new DomainError("bill_already_closed", "Esta conta já foi fechada.");
          }
        }),
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
    await runFinalize(outingId, billId, { kind: "marks", leftover }, plan.payers, context);
    return { status: "closed" };
  }
  await runFinalize(outingId, billId, { kind: "split", split: plan.split }, plan.payers, context);
  return { status: "closed" };
}

async function runFinalize(outingId: string, billId: string, closing: Closing, payers: Payer[], context: Awaited<ReturnType<typeof outingContext>>) {
  try {
    await asService(() => getDb().transaction((tx) => finalize(tx, outingId, billId, closing, payers, context)));
  } catch (error) {
    translate(error);
  }
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
  await runFinalize(outingId, billId, { kind: "marks", leftover: { mode: "transfer", personId } }, [], context);
}
