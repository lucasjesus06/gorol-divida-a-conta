import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { files, notifications, paymentReceiptReadings, payments, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const paymentsServer = await import("./payments");
const server = await import("./payment-receipts");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

const DAY = 24 * 60 * 60 * 1000;
const CODE = "E60701190202611281432AbC9dEf3Gh1";

let lucas: string;
let maria: string;
let outingId: string;

// Texto de exemplo escrito à mão no formato de um comprovante; não é um comprovante real.
function receiptText(options: { amount?: string; to?: string; code?: string; date?: string } = {}) {
  const date = options.date ?? new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `Comprovante de transferência\n${date}\nValor\nR$ ${options.amount ?? "45,00"}\nTipo de transferência\nPix\nDestino\nNome\n${options.to ?? "Lucas Jesus Santos"}\nID da transação\n${options.code ?? CODE}`;
}

async function declared(amountCents = 4500) {
  const id = await paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents });
  const [file] = await db()
    .insert(files)
    .values({ kind: "payment_receipt", ownerId: maria, outingId, subjectId: id, path: `recibos/${crypto.randomUUID()}`, mimeType: "image/png", sizeBytes: 1000, originalName: "c.png", status: "ready" })
    .returning({ id: files.id });
  return { paymentId: id, fileId: file.id };
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  const [other] = await db().insert(people).values({ displayName: "Maria", phone: "+5511999990001" }).returning();
  await approveAccount(db(), other.id);
  await outingsServer.addParticipant(lucas, outingId, { name: "Maria", phone: "11999990001" });
  maria = other.id;
});

describe("enviar o comprovante", () => {
  it("comprovante coerente confirma o pagamento, com prazo de 3 dias para contestar, e avisa quem recebe", async () => {
    const { paymentId, fileId } = await declared();
    const result = await server.sendReceipt(maria, outingId, paymentId, { fileId, text: receiptText() });
    expect(result).toEqual({ outcome: "settled", issues: [] });

    const [row] = await db().select().from(payments).where(eq(payments.id, paymentId));
    expect(row).toMatchObject({ status: "confirmed", confirmedBy: "receipt" });
    const days = ((row?.contestableUntil?.getTime() ?? 0) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThanOrEqual(3);

    const [view] = await paymentsServer.listPayments(lucas, outingId);
    expect(view).toMatchObject({ canContest: true, canResolve: false });
    expect(view?.receipt).toMatchObject({ amountCents: 4500, issues: [] });
    const notices = (await db().select().from(notifications)).filter((notice) => notice.personId === lucas);
    expect(notices.some((notice) => notice.body.includes("3 dias"))).toBe(true);
  });

  it("valor diferente deixa o pagamento esperando o credor, com a inconsistência clara", async () => {
    const { paymentId, fileId } = await declared();
    const result = await server.sendReceipt(maria, outingId, paymentId, { fileId, text: receiptText({ amount: "40,00" }) });
    expect(result.outcome).toBe("review");
    expect(result.issues).toEqual([{ code: "amount_differs", message: "O comprovante mostra R$ 40,00, mas o pagamento declarado é de R$ 45,00." }]);

    const [view] = await paymentsServer.listPayments(lucas, outingId);
    expect(view).toMatchObject({ status: "declared", canResolve: true });
    expect(view?.receipt?.issues).toHaveLength(1);
    expect((await db().select().from(notifications)).some((notice) => notice.kind === "payment_receipt_review" && notice.personId === lucas)).toBe(true);

    await paymentsServer.confirmPayment(lucas, outingId, paymentId);
    expect((await db().select().from(payments))[0]).toMatchObject({ status: "confirmed", confirmedBy: "creditor" });
  });

  it("destinatário diferente e documento que não é Pix também vão para avaliação", async () => {
    const first = await declared();
    expect((await server.sendReceipt(maria, outingId, first.paymentId, { fileId: first.fileId, text: receiptText({ to: "Carlos Pereira" }) })).issues.map((issue) => issue.code)).toEqual(["recipient_differs"]);
    const second = await declared();
    const other = await server.sendReceipt(maria, outingId, second.paymentId, { fileId: second.fileId, text: "CUPOM FISCAL\nPizza 40,00\nTOTAL R$ 45,00" });
    expect(other.outcome).toBe("review");
    expect(other.issues[0]?.code).toBe("not_a_pix_receipt");
  });

  it("o mesmo código não vale para dois pagamentos, mas volta a valer se o primeiro foi recusado", async () => {
    const first = await declared();
    await server.sendReceipt(maria, outingId, first.paymentId, { fileId: first.fileId, text: receiptText() });
    const second = await declared();
    const reused = await server.sendReceipt(maria, outingId, second.paymentId, { fileId: second.fileId, text: receiptText() });
    expect(reused.issues.map((issue) => issue.code)).toEqual(["code_already_used"]);

    const third = await declared();
    await paymentsServer.rejectPayment(lucas, outingId, second.paymentId);
    await db().update(payments).set({ status: "contested", confirmedBy: null, contestReason: "x", resolvedAt: new Date() }).where(eq(payments.id, first.paymentId));
    await paymentsServer.rejectPayment(lucas, outingId, first.paymentId);
    expect((await server.sendReceipt(maria, outingId, third.paymentId, { fileId: third.fileId, text: receiptText() })).outcome).toBe("settled");
  });

  it("só quem pagou envia, uma vez só, com o arquivo anexado", async () => {
    const { paymentId, fileId } = await declared();
    await expect(server.sendReceipt(lucas, outingId, paymentId, { fileId, text: receiptText() })).rejects.toMatchObject({ code: "only_payer_sends_proof" });
    await expect(server.sendReceipt(maria, outingId, paymentId, { fileId: crypto.randomUUID(), text: receiptText() })).rejects.toMatchObject({ code: "receipt_file_not_found" });
    await server.sendReceipt(maria, outingId, paymentId, { fileId, text: receiptText({ amount: "1,00" }) });
    await expect(server.sendReceipt(maria, outingId, paymentId, { fileId, text: receiptText() })).rejects.toMatchObject({ code: "receipt_already_sent" });
    expect((await db().select().from(paymentReceiptReadings)).length).toBe(1);
  });

  it("texto lido vazio vai para avaliação, listando tudo o que não foi possível ler", async () => {
    const { paymentId, fileId } = await declared();
    const result = await server.sendReceipt(maria, outingId, paymentId, { fileId, text: "" });
    expect(result.outcome).toBe("review");
    expect(result.issues.map((issue) => issue.code)).toEqual(["not_a_pix_receipt", "amount_unreadable", "recipient_unreadable", "date_unreadable", "code_unreadable"]);
  });
});

describe("contestar", () => {
  async function settled() {
    const { paymentId, fileId } = await declared();
    await server.sendReceipt(maria, outingId, paymentId, { fileId, text: receiptText() });
    return paymentId;
  }

  it("quem recebeu contesta, quem pagou é avisado, e o credor ainda pode confirmar depois", async () => {
    const paymentId = await settled();
    await server.contestReceiptPayment(lucas, outingId, paymentId, "O dinheiro não caiu");
    expect((await db().select().from(payments))[0]).toMatchObject({ status: "contested", confirmedBy: null, contestReason: "O dinheiro não caiu" });
    expect((await db().select().from(notifications)).some((notice) => notice.kind === "payment_contested" && notice.personId === maria)).toBe(true);
    const [view] = await paymentsServer.listPayments(lucas, outingId);
    expect(view).toMatchObject({ status: "contested", canResolve: true, canContest: false });

    await paymentsServer.confirmPayment(lucas, outingId, paymentId);
    expect((await db().select().from(payments))[0]).toMatchObject({ status: "confirmed", confirmedBy: "creditor", contestReason: null, contestableUntil: null });
  });

  it("exige o motivo, é só do credor e só dentro do prazo", async () => {
    const paymentId = await settled();
    await expect(server.contestReceiptPayment(lucas, outingId, paymentId, " ")).rejects.toMatchObject({ code: "contest_reason_required" });
    await expect(server.contestReceiptPayment(maria, outingId, paymentId, "x")).rejects.toMatchObject({ code: "only_creditor_resolves" });

    const late = await declared();
    await db()
      .update(payments)
      .set({ status: "confirmed", confirmedBy: "receipt", resolvedAt: new Date(), contestableUntil: new Date(Date.now() - DAY) })
      .where(eq(payments.id, late.paymentId));
    await expect(server.contestReceiptPayment(lucas, outingId, late.paymentId, "x")).rejects.toMatchObject({ code: "contest_window_closed" });
  });

  it("pagamento confirmado à mão não se contesta", async () => {
    const { paymentId } = await declared();
    await paymentsServer.confirmPayment(lucas, outingId, paymentId);
    await expect(server.contestReceiptPayment(lucas, outingId, paymentId, "x")).rejects.toMatchObject({ code: "payment_not_contestable" });
  });
});
