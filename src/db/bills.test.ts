import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { billClaims, billPayers, consumptionBills, outingParticipants, outingPayers, people } from "@/db/schema";
import { createTestDatabase, insertBill, seedOuting } from "@/test/database";

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

const claim = (itemId: string, personId: string, num: number, den = 1, markedBy = personId) =>
  ({ itemId, personId, quantityNum: num, quantityDen: den, markedBy });

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900400001", "+5511900400002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [caioRow, strangerRow] = await db
    .insert(people)
    .values([
      { displayName: "Caio", phone: "+5511900400003" },
      { displayName: "Intruso", phone: "+5511900400004" },
    ])
    .returning();
  caio = caioRow.id;
  stranger = strangerRow.id;
  await db.insert(outingParticipants).values({ outingId, personId: caio, displayName: "Caio" });
  await db.insert(outingPayers).values({ outingId, personId: maria, declaredBy: lucas });
});

describe("a conta fecha", () => {
  it("itens mais taxa menos desconto precisam ser o que foi pago", async () => {
    await insertBill(db, { outingId, openedBy: lucas, payers: { [lucas]: 11000 }, items: [{ description: "Cerveja", totalCents: 5000 }, { description: "Porção", totalCents: 5000 }], serviceChargeCents: 1000 });
    await expectRejectedWith(insertBill(db, { outingId, openedBy: lucas, payers: { [lucas]: 10000 }, items: [{ description: "Cerveja", totalCents: 5000 }, { description: "Porção", totalCents: 5000 }], serviceChargeCents: 1000 }), "bill_not_balanced");
  });

  it("recusa conta sem itens, pagador de fora ou não declarado", async () => {
    await expectRejectedWith(
      db.transaction(async (tx) => {
        const [bill] = await tx.insert(consumptionBills).values({ outingId, openedBy: lucas, description: "Vazia", occurredAt: new Date() }).returning();
        await tx.insert(billPayers).values({ billId: bill.id, personId: lucas, amountCents: 1000 });
      }),
      "bill_without_items",
    );
    await expectRejectedWith(insertBill(db, { outingId, openedBy: lucas, payers: { [stranger]: 1000 }, items: [{ description: "x", totalCents: 1000 }] }), "bill_person_not_in_outing");
    await expectRejectedWith(insertBill(db, { outingId, openedBy: lucas, payers: { [caio]: 1000 }, items: [{ description: "x", totalCents: 1000 }] }), "bill_payer_not_declared");
  });
});

describe("marcar o consumo", () => {
  it("ninguém marca mais do que o item tem, com frações exatas", async () => {
    const { items } = await insertBill(db, { outingId, openedBy: lucas, payers: { [lucas]: 3000 }, items: [{ description: "Porção", totalCents: 3000 }] });
    const item = items[0].id;
    await db.insert(billClaims).values([claim(item, lucas, 1, 3), claim(item, maria, 1, 3), claim(item, caio, 1, 3)]);
    await expectRejectedWith(db.insert(billClaims).values(claim(item, stranger, 1, 100)), "claim_person_not_in_outing");

    const second = await insertBill(db, { outingId, openedBy: lucas, payers: { [lucas]: 2000 }, items: [{ description: "Cerveja", totalCents: 2000, num: 2 }] });
    const beer = second.items[0].id;
    await db.insert(billClaims).values(claim(beer, lucas, 3, 2));
    await expectRejectedWith(db.insert(billClaims).values(claim(beer, maria, 3, 4)), "item_over_claimed");
    await db.insert(billClaims).values(claim(beer, maria, 1, 2));
    await expectRejectedWith(db.update(billClaims).set({ quantityNum: 2, quantityDen: 1 }).where(eq(billClaims.itemId, beer)), "item_over_claimed");
  });

  it("cada um marca o próprio consumo; o dono marca por quem não usa o app; outros não mexem", async () => {
    const { items } = await insertBill(db, { outingId, openedBy: lucas, payers: { [lucas]: 4000 }, items: [{ description: "Pizza", totalCents: 4000, num: 4 }] });
    const item = items[0].id;
    await as(caio, (tx) => tx.insert(billClaims).values(claim(item, caio, 1)));
    expect(await as(maria, (tx) => tx.update(billClaims).set({ quantityNum: 2 }).where(and(eq(billClaims.itemId, item), eq(billClaims.personId, caio))).returning())).toEqual([]);
    await as(caio, (tx) => tx.insert(billClaims).values(claim(item, maria, 1, 1, caio)));
    expect(await as(lucas, (tx) => tx.update(billClaims).set({ quantityNum: 2 }).where(and(eq(billClaims.itemId, item), eq(billClaims.personId, caio))).returning())).toHaveLength(1);
    await expect(as(stranger, (tx) => tx.insert(billClaims).values(claim(item, stranger, 1)))).rejects.toThrow();
    expect(await as(stranger, (tx) => tx.$count(billClaims))).toBe(0);
  });

  it("só participantes enxergam as contas e as marcações", async () => {
    expect(await as(caio, (tx) => tx.$count(consumptionBills))).toBeGreaterThan(0);
    expect(await as(stranger, (tx) => tx.$count(consumptionBills))).toBe(0);
  });
});

describe("conta fechada não muda", () => {
  it("fechada, não aceita marcação nova nem retirada, e o resto da conta é imutável", async () => {
    const { bill, items } = await insertBill(db, { outingId, openedBy: lucas, payers: { [lucas]: 1000 }, items: [{ description: "Água", totalCents: 1000 }] });
    await db.insert(billClaims).values(claim(items[0].id, lucas, 1));
    await expectRejectedWith(db.update(consumptionBills).set({ description: "outra" }).where(eq(consumptionBills.id, bill.id)), "bill_is_immutable");
    await db.update(consumptionBills).set({ status: "closed", closedAt: new Date() }).where(eq(consumptionBills.id, bill.id));
    await expectRejectedWith(db.update(billClaims).set({ quantityNum: 1 }).where(eq(billClaims.itemId, items[0].id)), "bill_not_open");
    await expectRejectedWith(db.delete(billClaims).where(eq(billClaims.itemId, items[0].id)), "bill_not_open");
    await expectRejectedWith(db.update(consumptionBills).set({ status: "open", closedAt: null }).where(eq(consumptionBills.id, bill.id)), "bill_status_change_invalid");
    await expectRejectedWith(db.delete(consumptionBills).where(eq(consumptionBills.id, bill.id)), "financial_history_is_immutable");
  });
});
