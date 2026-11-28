import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { billClaims, billItems, billPayers, consumptionBills, outingParticipants, outingPayers, outings, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let caio: string;
let stranger: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

async function expectRejectedWith(promise: Promise<unknown>, reason: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught as { message: string; cause?: { message: string } },
  );
  expect(error, "deveria ter sido recusado").not.toBeNull();
  expect(`${error?.message} ${error?.cause?.message ?? ""}`).toContain(reason);
}

const draft = (openedBy: string, extra: Partial<typeof consumptionBills.$inferInsert> = {}) =>
  ({ outingId, openedBy, description: "Bar do Zé", occurredAt: new Date(), ...extra }) as typeof consumptionBills.$inferInsert;

const openAs = (personId: string, extra: Partial<typeof consumptionBills.$inferInsert> = {}) =>
  as(personId, async (tx) => (await tx.insert(consumptionBills).values(draft(personId, extra)).returning({ id: consumptionBills.id }))[0].id);

const addItem = (personId: string, billId: string, totalCents = 1000, description = "Cerveja") =>
  as(personId, async (tx) => (await tx.insert(billItems).values({ billId, position: 0, addedBy: personId, description, totalCents, quantityNum: 1, quantityDen: 1 }).returning({ id: billItems.id }))[0].id);

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511901700001", "+5511901700002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [caioRow, strangerRow] = await db
    .insert(people)
    .values([
      { displayName: "Caio", phone: "+5511901700003" },
      { displayName: "Intruso", phone: "+5511901700004" },
    ])
    .returning();
  caio = caioRow.id;
  stranger = strangerRow.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
});

describe("abrir a conta", () => {
  it("qualquer participante abre, sem informar quem pagou; quem está fora não", async () => {
    expect(await openAs(caio)).toBeTruthy();
    await expect(openAs(stranger)).rejects.toThrow();
  });

  it("ninguém abre a conta em nome de outra pessoa", async () => {
    await expect(as(maria, (tx) => tx.insert(consumptionBills).values(draft(lucas)))).rejects.toThrow();
  });

  it("rolê encerrado não aceita conta nova", async () => {
    const [closed] = await db.insert(outings).values({ name: "Velho", kind: "event", createdBy: lucas, status: "closed", closedAt: new Date() }).returning();
    await db.insert(outingParticipants).values({ outingId: closed.id, personId: maria, displayName: "Maria" });
    await expect(as(maria, (tx) => tx.insert(consumptionBills).values({ ...draft(maria), outingId: closed.id }))).rejects.toThrow();
  });

  it("o modo direto exige o valor total, e o detalhado não pode ter", async () => {
    await expectRejectedWith(db.insert(consumptionBills).values(draft(lucas, { mode: "direct" })), "consumption_bills_direct_total_matches_mode");
    await expectRejectedWith(db.insert(consumptionBills).values(draft(lucas, { mode: "detailed", directTotalCents: 5000 })), "consumption_bills_direct_total_matches_mode");
    await expectRejectedWith(db.insert(consumptionBills).values(draft(lucas, { mode: "direct", directTotalCents: 0 })), "consumption_bills_direct_total_matches_mode");
    expect(await openAs(maria, { mode: "direct", directTotalCents: 8000 })).toBeTruthy();
  });
});

describe("itens lançados à medida que se consome", () => {
  it("qualquer participante lança item em conta aberta, em nome próprio, e a ordem não se repete", async () => {
    const billId = await openAs(lucas);
    await addItem(maria, billId, 1000, "Cerveja");
    await addItem(caio, billId, 2000, "Porção");
    const rows = await db.select({ position: billItems.position, by: billItems.addedBy }).from(billItems).where(eq(billItems.billId, billId)).orderBy(billItems.position);
    expect(rows.map((row) => row.position)).toEqual([0, 1]);
    expect(rows.map((row) => row.by)).toEqual([maria, caio]);
  });

  it("quem está fora não lança item, nem em nome de outro", async () => {
    const billId = await openAs(lucas);
    await expect(addItem(stranger, billId)).rejects.toThrow();
    await expect(as(maria, (tx) => tx.insert(billItems).values({ billId, position: 0, addedBy: lucas, description: "x", totalCents: 100, quantityNum: 1, quantityDen: 1 }))).rejects.toThrow();
  });

  it("não lança item em conta fechada", async () => {
    const billId = await openAs(lucas, { mode: "direct", directTotalCents: 1000 });
    await db.transaction(async (tx) => {
      await tx.insert(billPayers).values({ billId, personId: lucas, amountCents: 1000 });
      await tx.update(consumptionBills).set({ status: "closed", closedAt: new Date() }).where(eq(consumptionBills.id, billId));
    });
    await expect(addItem(maria, billId)).rejects.toThrow();
  });

  it("quem lançou, quem abriu e o dono editam e removem; os outros não", async () => {
    const billId = await openAs(maria);
    const itemId = await addItem(caio, billId, 1500, "Suco");
    await as(caio, (tx) => tx.update(billItems).set({ totalCents: 1800 }).where(eq(billItems.id, itemId)));
    await as(maria, (tx) => tx.update(billItems).set({ description: "Suco grande" }).where(eq(billItems.id, itemId)));
    await as(lucas, (tx) => tx.update(billItems).set({ totalCents: 1700 }).where(eq(billItems.id, itemId)));
    expect((await db.select().from(billItems).where(eq(billItems.id, itemId)))[0]).toMatchObject({ totalCents: 1700, description: "Suco grande" });

    const other = await openAs(lucas);
    const otherItem = await addItem(lucas, other, 900);
    await as(maria, (tx) => tx.update(billItems).set({ totalCents: 1 }).where(eq(billItems.id, otherItem)));
    expect((await db.select().from(billItems).where(eq(billItems.id, otherItem)))[0].totalCents).toBe(900);
    await as(caio, (tx) => tx.delete(billItems).where(eq(billItems.id, otherItem)));
    expect(await db.$count(billItems, eq(billItems.id, otherItem))).toBe(1);
    await as(caio, (tx) => tx.delete(billItems).where(eq(billItems.id, itemId)));
    expect(await db.$count(billItems, eq(billItems.id, itemId))).toBe(0);
  });

  it("item marcado por alguém não muda nem some, e quem lançou e a ordem não se alteram", async () => {
    const billId = await openAs(lucas);
    const itemId = await addItem(lucas, billId, 3000, "Porção");
    await db.insert(billClaims).values({ itemId, personId: maria, quantityNum: 1, quantityDen: 2, markedBy: maria });
    await expectRejectedWith(db.update(billItems).set({ totalCents: 100 }).where(eq(billItems.id, itemId)), "item_has_claims");
    await expectRejectedWith(db.delete(billItems).where(eq(billItems.id, itemId)), "item_has_claims");
    const free = await addItem(lucas, billId, 500, "Água");
    await expectRejectedWith(db.update(billItems).set({ position: 9 }).where(eq(billItems.id, free)), "bill_item_is_immutable");
    await expectRejectedWith(db.update(billItems).set({ addedBy: maria }).where(eq(billItems.id, free)), "bill_item_is_immutable");
  });

  it("depois de fechada a conta, os itens não mudam mais", async () => {
    const billId = await openAs(lucas);
    const itemId = await addItem(lucas, billId, 1000);
    await db.transaction(async (tx) => {
      await tx.insert(billPayers).values({ billId, personId: lucas, amountCents: 1000 });
      await tx.update(consumptionBills).set({ status: "closed", closedAt: new Date() }).where(eq(consumptionBills.id, billId));
    });
    await expectRejectedWith(db.update(billItems).set({ totalCents: 5 }).where(eq(billItems.id, itemId)), "bill_not_open");
    await expectRejectedWith(db.delete(billItems).where(eq(billItems.id, itemId)), "bill_not_open");
  });
});

describe("fechar a conta", () => {
  const close = (billId: string, payers: Record<string, number>) =>
    db.transaction(async (tx) => {
      await tx.insert(billPayers).values(Object.entries(payers).map(([personId, amountCents]) => ({ billId, personId, amountCents })));
      await tx.update(consumptionBills).set({ status: "closed", closedAt: new Date() }).where(eq(consumptionBills.id, billId));
    });

  it("na conta direta, o que foi pago precisa ser o total", async () => {
    const ok = await openAs(lucas, { mode: "direct", directTotalCents: 8000 });
    await close(ok, { [lucas]: 8000 });
    const bad = await openAs(lucas, { mode: "direct", directTotalCents: 8000 });
    await expectRejectedWith(close(bad, { [lucas]: 7000 }), "bill_not_balanced");
  });

  it("na conta detalhada, itens mais taxa menos desconto precisam ser o que foi pago", async () => {
    const billId = await openAs(lucas);
    await addItem(maria, billId, 5000);
    await addItem(caio, billId, 5000);
    await db.update(consumptionBills).set({ serviceChargeCents: 1000 }).where(eq(consumptionBills.id, billId));
    await expectRejectedWith(close(billId, { [lucas]: 10000 }), "bill_not_balanced");
    await close(billId, { [lucas]: 11000 });
  });

  it("sem itens a conta detalhada não fecha, e quem paga precisa ser o dono ou um pagante declarado", async () => {
    const empty = await openAs(lucas);
    await expectRejectedWith(close(empty, { [lucas]: 1000 }), "bill_without_items");
    const billId = await openAs(lucas, { mode: "direct", directTotalCents: 1000 });
    await expectRejectedWith(close(billId, { [caio]: 1000 }), "bill_payer_not_declared");
    await expectRejectedWith(close(billId, { [stranger]: 1000 }), "bill_person_not_in_outing");
    await db.insert(outingPayers).values({ outingId, personId: caio, declaredBy: lucas });
    await close(billId, { [caio]: 1000 });
  });

  it("taxa, desconto e valor da conta direta mudam só enquanto a conta está aberta", async () => {
    const billId = await openAs(lucas, { mode: "direct", directTotalCents: 2000 });
    await db.update(consumptionBills).set({ directTotalCents: 2500 }).where(eq(consumptionBills.id, billId));
    await close(billId, { [lucas]: 2500 });
    await expectRejectedWith(db.update(consumptionBills).set({ directTotalCents: 9 }).where(eq(consumptionBills.id, billId)), "bill_");
    await expectRejectedWith(db.update(consumptionBills).set({ mode: "detailed", directTotalCents: null }).where(eq(consumptionBills.id, billId)), "bill_");
  });
});
