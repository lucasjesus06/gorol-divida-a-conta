import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenseDisputes, notifications, people, reminderLog } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const expensesServer = await import("./expenses");
const paymentsServer = await import("./payments");
const pixServer = await import("./pix");
const server = await import("./charges");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

// 12h em São Paulo, dentro da janela de envio.
const noon = new Date("2026-03-12T15:00:00Z");
const hoursLater = (hours: number) => new Date(noon.getTime() + hours * 3_600_000);

async function member(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas Jesus", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas Jesus" }, { name: "Churrasco", kind: "event" });
  maria = await member("Maria Souza", "11999990001");
  caio = await member("Caio", "11999990002");
  await expensesServer.registerExpense(lucas, outingId, {
    description: "Carne",
    totalCents: 9000,
    payers: [{ personId: lucas, amountCents: 9000 }],
    split: { method: "equal", personIds: [lucas, maria, caio] },
    occurredAt: new Date("2026-03-10T20:00:00Z"),
  });
});

describe("fila de cobrança", () => {
  it("lista quem deve, com mensagem pronta e link do WhatsApp na conversa certa", async () => {
    await pixServer.savePixKey(lucas, { type: "email", value: "lucas@exemplo.com" });
    const queue = await server.getChargeQueue(noon);

    expect(queue.map((item) => item.debtor.name).sort()).toEqual(["Caio", "Maria Souza"]);
    const item = queue.find((candidate) => candidate.debtor.id === maria)!;
    expect(item).toMatchObject({ amountCents: 3000, decision: { action: "send", sequence: 1 }, creditor: { id: lucas } });
    expect(item.message).toContain("Maria");
    expect(item.message).toContain("30,00");
    expect(item.message).toContain("lucas@exemplo.com");
    expect(item.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5511999990001\?text=/);
  });

  it("fora da janela de horário espera, sem mensagem nem link", async () => {
    const night = new Date("2026-03-12T05:00:00Z");
    const [item] = await server.getChargeQueue(night);
    expect(item.decision).toMatchObject({ action: "wait", reason: "outside_window" });
    expect(item.message).toBeNull();
    expect(item.whatsappUrl).toBeNull();
  });

  it("quem já pagou e foi confirmado sai da fila", async () => {
    const paymentId = await paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents: 3000 });
    await paymentsServer.confirmPayment(lucas, outingId, paymentId);
    expect((await server.getChargeQueue(noon)).map((item) => item.debtor.id)).toEqual([caio]);
  });

  it("quem tem contestação aberta fica segurado", async () => {
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    await db().insert(expenseDisputes).values({ outingId, expenseId: expense.id, openedBy: maria, subject: "amount", message: "Valor errado" });
    const item = (await server.getChargeQueue(noon)).find((candidate) => candidate.debtor.id === maria)!;
    expect(item.decision).toMatchObject({ action: "hold", reason: "open_dispute" });
  });
});

describe("registrar cobrança", () => {
  const maria1 = () => ({ debtorId: maria, creditorId: lucas });

  it("pelo WhatsApp guarda quem disparou e passa a respeitar o intervalo", async () => {
    await server.recordReminder(lucas, { ...maria1(), channel: "whatsapp" }, noon);
    const [row] = await db().select().from(reminderLog);
    expect(row).toMatchObject({ debtorId: maria, creditorId: lucas, sequence: 1, channel: "whatsapp", sentBy: lucas });

    const item = (await server.getChargeQueue(hoursLater(1))).find((candidate) => candidate.debtor.id === maria)!;
    expect(item.decision).toMatchObject({ action: "wait", reason: "min_interval" });
    await expect(server.recordReminder(lucas, { ...maria1(), channel: "whatsapp" }, hoursLater(1))).rejects.toMatchObject({ code: "reminder_not_allowed" });
    expect(await db().$count(reminderLog)).toBe(1);

    const next = (await server.getChargeQueue(hoursLater(24))).find((candidate) => candidate.debtor.id === maria)!;
    expect(next.decision).toMatchObject({ action: "send", sequence: 2 });
  });

  it("pelo app grava e avisa o devedor com o destino do resumo", async () => {
    await server.recordReminder(lucas, { ...maria1(), channel: "app" }, noon);
    const [notice] = await db().select().from(notifications);
    expect(notice).toMatchObject({ personId: maria, kind: "payment_reminder", url: `/resumo/${lucas}` });
  });

  it("recusa cobrar quem não deve nada", async () => {
    await expect(server.recordReminder(lucas, { debtorId: lucas, creditorId: maria, channel: "app" }, noon)).rejects.toMatchObject({ code: "nothing_owed" });
  });
});

describe("pausa", () => {
  it("só depois de algumas cobranças; a pausa segura e depois volta a cobrar", async () => {
    const pair = { debtorId: maria, creditorId: lucas };
    await expect(server.pauseCharges(lucas, pair, noon)).rejects.toMatchObject({ code: "pause_not_available" });

    for (const day of [0, 1, 2]) {
      await server.recordReminder(lucas, { ...pair, channel: "whatsapp" }, hoursLater(day * 24));
    }
    const pauseAt = hoursLater(48 + 1);
    await server.pauseCharges(lucas, pair, pauseAt);

    const during = (await server.getChargeQueue(hoursLater(48 + 24))).find((item) => item.debtor.id === maria)!;
    expect(during).toMatchObject({ decision: { action: "wait", reason: "paused" }, pausesUsed: 1 });

    const after = (await server.getChargeQueue(hoursLater(48 + 1 + 3 * 24 + 1))).find((item) => item.debtor.id === maria)!;
    expect(after.decision.action).toBe("send");
  });
});

describe("textos", () => {
  it("sem texto próprio usa os padrões; salvar troca todos e a ordem gira na cobrança", async () => {
    expect((await server.getTemplates()).length).toBeGreaterThan(0);
    await server.saveTemplates(lucas, ["Primeiro {nome}", "Segundo {nome}"]);
    expect(await server.getTemplates()).toEqual(["Primeiro {nome}", "Segundo {nome}"]);

    const first = (await server.getChargeQueue(noon)).find((item) => item.debtor.id === maria)!;
    expect(first.message).toBe("Primeiro Maria");
    await server.recordReminder(lucas, { debtorId: maria, creditorId: lucas, channel: "whatsapp" }, noon);
    const second = (await server.getChargeQueue(hoursLater(24))).find((item) => item.debtor.id === maria)!;
    expect(second.message).toBe("Segundo Maria");
  });

  it("recusa variável desconhecida e não perde os textos que já havia", async () => {
    await server.saveTemplates(lucas, ["Oi {nome}"]);
    await expect(server.saveTemplates(lucas, ["Oi {apelido}"])).rejects.toMatchObject({ code: "template_unknown_variable" });
    expect(await server.getTemplates()).toEqual(["Oi {nome}"]);
  });
});
