import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { files, paymentReceiptReadings, payments, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let stranger: string;

const DAY = 24 * 60 * 60 * 1000;
const CODE = "E60701190202611281432AbC9dEf3Gh1";

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

/** A payment from Maria to Lucas; with `byReceipt` it is settled the way the server does it, as a service. */
async function payment(options: { byReceipt?: { contestableUntil: Date } } = {}) {
  const [row] = await db.insert(payments).values({ outingId, fromId: maria, toId: lucas, amountCents: 4500 }).returning({ id: payments.id });
  if (options.byReceipt) {
    await db
      .update(payments)
      .set({ status: "confirmed", confirmedBy: "receipt", resolvedAt: new Date(), contestableUntil: options.byReceipt.contestableUntil })
      .where(eq(payments.id, row.id));
  }
  return row.id;
}

async function receiptFile(paymentId: string) {
  const [file] = await db
    .insert(files)
    .values({ kind: "payment_receipt", ownerId: maria, outingId, subjectId: paymentId, path: `recibos/${crypto.randomUUID()}`, mimeType: "image/png", sizeBytes: 1000, originalName: "comprovante.png", status: "ready" })
    .returning({ id: files.id });
  return file.id;
}

const contestAs = (personId: string, id: string, reason = "O dinheiro não caiu") =>
  as(personId, (tx) =>
    tx
      .update(payments)
      .set({ status: "contested", confirmedBy: null, contestReason: reason, resolvedAt: new Date() })
      .where(eq(payments.id, id))
      .returning({ id: payments.id }),
  );

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900800001", "+5511900800002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [strangerRow] = await db.insert(people).values({ displayName: "Intruso", phone: "+5511900800003" }).returning();
  stranger = strangerRow.id;
});

describe("leitura do comprovante", () => {
  it("quem pagou grava o que foi lido, e os participantes enxergam; um estranho não", async () => {
    const id = await payment();
    const fileId = await receiptFile(id);
    await as(maria, (tx) =>
      tx.insert(paymentReceiptReadings).values({ paymentId: id, outingId, fileId, amountCents: 4500, readDate: "2026-11-28", recipientName: "Maria Silva", transactionId: CODE, issues: [] }),
    );
    expect(await as(lucas, (tx) => tx.$count(paymentReceiptReadings))).toBe(1);
    expect(await as(stranger, (tx) => tx.$count(paymentReceiptReadings))).toBe(0);
  });

  it("só quem pagou grava a leitura do próprio pagamento", async () => {
    const id = await payment();
    const fileId = await receiptFile(id);
    await expectRejectedWith(
      as(lucas, (tx) => tx.insert(paymentReceiptReadings).values({ paymentId: id, outingId, fileId, issues: [] })),
      "row-level security",
    );
  });

  it("recusa código fora do formato, e a leitura não muda nem se apaga", async () => {
    const id = await payment();
    const fileId = await receiptFile(id);
    await expectRejectedWith(
      as(maria, (tx) => tx.insert(paymentReceiptReadings).values({ paymentId: id, outingId, fileId, transactionId: "nao-e-codigo", issues: [] })),
      "receipt_readings_code_shape",
    );
    const [saved] = await as(maria, (tx) =>
      tx.insert(paymentReceiptReadings).values({ paymentId: id, outingId, fileId, issues: [{ code: "amount_differs", message: "x" }] }).returning({ id: paymentReceiptReadings.id }),
    );
    await expectRejectedWith(db.update(paymentReceiptReadings).set({ amountCents: 1 }).where(eq(paymentReceiptReadings.id, saved.id)), "financial_history_is_immutable");
    await expectRejectedWith(db.delete(paymentReceiptReadings).where(eq(paymentReceiptReadings.id, saved.id)), "financial_history_is_immutable");
  });
});

describe("contestar um pagamento confirmado por comprovante", () => {
  it("quem recebe contesta dentro do prazo, e o motivo fica", async () => {
    const id = await payment({ byReceipt: { contestableUntil: new Date(Date.now() + 3 * DAY) } });
    expect(await contestAs(lucas, id)).toHaveLength(1);
    const [row] = await db.select().from(payments).where(eq(payments.id, id));
    expect(row).toMatchObject({ status: "contested", confirmedBy: null, contestReason: "O dinheiro não caiu" });
  });

  it("depois do prazo não contesta mais", async () => {
    const id = await payment({ byReceipt: { contestableUntil: new Date(Date.now() - DAY) } });
    await expectRejectedWith(contestAs(lucas, id), "payment_contest_window_closed");
  });

  it("quem pagou e quem é de fora não contestam", async () => {
    const id = await payment({ byReceipt: { contestableUntil: new Date(Date.now() + 3 * DAY) } });
    expect(await contestAs(maria, id)).toEqual([]);
    expect(await contestAs(stranger, id)).toEqual([]);
  });

  it("pagamento confirmado pelo próprio credor não é contestável", async () => {
    const id = await payment();
    await as(lucas, (tx) => tx.update(payments).set({ status: "confirmed", confirmedBy: "creditor", resolvedAt: new Date() }).where(eq(payments.id, id)));
    await expectRejectedWith(contestAs(lucas, id), "payment_status_change_invalid");
  });

  it("contestar exige o motivo, e o prazo nunca é alterado depois", async () => {
    const id = await payment({ byReceipt: { contestableUntil: new Date(Date.now() + 3 * DAY) } });
    await expectRejectedWith(
      as(lucas, (tx) => tx.update(payments).set({ status: "contested", confirmedBy: null, resolvedAt: new Date() }).where(eq(payments.id, id))),
      "payments_contest_matches_status",
    );
    await expectRejectedWith(db.update(payments).set({ contestableUntil: new Date(Date.now() + 30 * DAY) }).where(eq(payments.id, id)), "payment_is_immutable");
  });

  it("o credor pode confirmar de novo um pagamento contestado", async () => {
    const id = await payment({ byReceipt: { contestableUntil: new Date(Date.now() + 3 * DAY) } });
    await contestAs(lucas, id);
    await as(lucas, (tx) =>
      tx.update(payments).set({ status: "confirmed", confirmedBy: "creditor", contestReason: null, contestableUntil: null, resolvedAt: new Date() }).where(eq(payments.id, id)),
    );
    expect((await db.select().from(payments).where(eq(payments.id, id)))[0]?.status).toBe("confirmed");
  });
});
