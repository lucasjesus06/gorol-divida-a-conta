import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closingVotes, notifications, outingParticipants, outings, people } from "@/db/schema";
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
const server = await import("./closing-votes");
const params = await import("./system-parameters");
const settings = await import("./outing-settings");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

const t0 = new Date("2026-03-10T15:00:00Z");
const daysLater = (days: number, from = t0) => new Date(from.getTime() + days * 86_400_000);

async function member(name: string, phone: string, account = true) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  if (account) {
    await approveAccount(db(), row.id);
    await outingsServer.addParticipant(lucas, outingId, { name, phone });
  } else {
    await db().insert(outingParticipants).values({ outingId, personId: row.id, displayName: name });
  }
  return row.id;
}

async function pay(payer: string, total: number, among: string[]) {
  await expensesServer.declarePayer(lucas, outingId, payer).catch(() => undefined);
  await expensesServer.registerExpense(payer, outingId, {
    description: "Despesa",
    totalCents: total,
    payers: [{ personId: payer, amountCents: total }],
    split: { method: "equal", personIds: among },
    occurredAt: new Date("2026-03-09T20:00:00Z"),
  });
}

const status = async () => (await db().select().from(outings).where(eq(outings.id, outingId)))[0].status;

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await member("Maria", "11999990001");
  caio = await member("Caio", "11999990002");
});

describe("quando só o dono tem a receber", () => {
  it("encerra na hora, sem votação", async () => {
    await pay(lucas, 9000, [lucas, maria, caio]);
    expect(await server.requestClosing(lucas, outingId, t0)).toEqual({ closed: true });
    expect(await status()).toBe("closed");
    expect(await db().$count(closingVotes)).toBe(0);
  });
});

describe("quando há outros com a receber", () => {
  // Lucas +4000, Maria +1000, Caio -5000.
  beforeEach(async () => {
    await pay(lucas, 9000, [lucas, maria, caio]);
    await pay(maria, 6000, [lucas, maria, caio]);
  });

  it("abre a votação só com quem tem a receber; o dono já aceita e a Maria é avisada", async () => {
    expect(await server.requestClosing(lucas, outingId, t0)).toEqual({ closed: false });
    const view = (await server.getClosingVote(maria, outingId, t0))!;
    expect(view).toMatchObject({ status: "open", canAnswer: true });
    expect(view.choices.map((choice) => [choice.name, choice.decision]).sort()).toEqual([["Lucas", "accepted"], ["Maria", "pending"]]);
    expect(view.deadline.toISOString()).toBe(daysLater(3).toISOString());
    expect((await db().select().from(notifications)).map((notice) => [notice.personId, notice.kind])).toEqual([[maria, "closing_vote_requested"]]);
    expect(await status()).toBe("active");
  });

  it("o prazo da votação segue o parâmetro do sistema", async () => {
    await params.saveParameter(lucas, "closing.vote_days", 5);
    await server.requestClosing(lucas, outingId, t0);
    expect((await server.getClosingVote(maria, outingId, t0))!.deadline.toISOString()).toBe(daysLater(5).toISOString());
    expect((await db().select().from(notifications))[0].body).toContain("5 dias");
    await server.getClosingVote(lucas, outingId, daysLater(4));
    expect(await status()).toBe("active");
    await server.getClosingVote(lucas, outingId, daysLater(5));
    expect(await status()).toBe("closed");
  });

  it("o ajuste do rolê vence o padrão do sistema no prazo da votação", async () => {
    await params.saveParameter(lucas, "closing.vote_days", 5);
    await settings.saveOutingSettings(lucas, outingId, { voteDays: 2, disputeWindowDays: null, defaultSplit: null, suggestedRoute: null, serviceFeePercent: null });
    await server.requestClosing(lucas, outingId, t0);
    expect((await server.getClosingVote(maria, outingId, t0))!.deadline.toISOString()).toBe(daysLater(2).toISOString());
  });

  it("quem deve não vota", async () => {
    await server.requestClosing(lucas, outingId, t0);
    expect((await server.getClosingVote(caio, outingId, t0))!.canAnswer).toBe(false);
    await expect(server.answerClosing(caio, outingId, true, t0)).rejects.toMatchObject({ code: "not_a_voter" });
  });

  it("quando a Maria aceita, o rolê encerra", async () => {
    await server.requestClosing(lucas, outingId, t0);
    await server.answerClosing(maria, outingId, true, daysLater(1));
    expect(await status()).toBe("closed");
    expect((await server.getClosingVote(lucas, outingId, daysLater(1)))!.status).toBe("approved");
  });

  it("um não mantém o rolê aberto, avisa o dono e deixa pedir de novo", async () => {
    await server.requestClosing(lucas, outingId, t0);
    await server.answerClosing(maria, outingId, false, daysLater(1));
    expect(await status()).toBe("active");
    expect((await db().select().from(notifications)).some((notice) => notice.personId === lucas && notice.kind === "closing_vote_resolved")).toBe(true);
    expect(await server.requestClosing(lucas, outingId, daysLater(1))).toEqual({ closed: false });
  });

  it("o silêncio por 3 dias vale como aceite e o rolê encerra ao abrir a tela", async () => {
    await server.requestClosing(lucas, outingId, t0);
    expect(await status()).toBe("active");
    await server.getClosingVote(lucas, outingId, daysLater(2));
    expect(await status()).toBe("active");
    await server.getClosingVote(lucas, outingId, daysLater(3));
    expect(await status()).toBe("closed");
  });

  it("um não dado antes do prazo vence o silêncio dos outros", async () => {
    await server.requestClosing(lucas, outingId, t0);
    await server.answerClosing(maria, outingId, false, daysLater(2));
    await server.getClosingVote(lucas, outingId, daysLater(10));
    expect(await status()).toBe("active");
  });

  it("se o saldo muda durante a votação, ela é cancelada e ninguém encerra por engano", async () => {
    await server.requestClosing(lucas, outingId, t0);
    const id = await paymentsServer.declarePayment(caio, outingId, { toId: lucas, amountCents: 1000 });
    await paymentsServer.confirmPayment(lucas, outingId, id);
    await server.getClosingVote(maria, outingId, daysLater(3));
    expect(await status()).toBe("active");
    expect((await server.getClosingVote(maria, outingId, daysLater(3)))!.status).toBe("cancelled");
  });

  it("só uma votação aberta por vez, e só o dono pede", async () => {
    await expect(server.requestClosing(maria, outingId, t0)).rejects.toMatchObject({ code: "only_admin_manages_outing" });
    await server.requestClosing(lucas, outingId, t0);
    await expect(server.requestClosing(lucas, outingId, t0)).rejects.toMatchObject({ code: "closing_vote_open" });
  });

  it("não aceita resposta duas vezes nem quando não há votação", async () => {
    await expect(server.answerClosing(maria, outingId, true, t0)).rejects.toMatchObject({ code: "closing_vote_not_found" });
    await server.requestClosing(lucas, outingId, t0);
    await server.answerClosing(maria, outingId, false, t0);
    await expect(server.answerClosing(maria, outingId, true, t0)).rejects.toMatchObject({ code: "closing_vote_not_found" });
  });

  it("outro bloqueio, como pagamento esperando, impede pedir o encerramento", async () => {
    await paymentsServer.declarePayment(caio, outingId, { toId: lucas, amountCents: 1000 });
    await expect(server.requestClosing(lucas, outingId, t0)).rejects.toMatchObject({ code: "closing_vote_not_applicable" });
  });
});

describe("convidado sem conta que deve", () => {
  it("impede o pedido: precisa pagar ou criar o cadastro", async () => {
    const edu = await member("Edu", "11999990009", false);
    await pay(lucas, 9000, [lucas, maria, edu]);
    await expect(server.requestClosing(lucas, outingId, t0)).rejects.toMatchObject({ code: "closing_vote_guest_debt" });
    expect(await status()).toBe("active");
  });
});

describe("rolê sem nada em aberto", () => {
  it("o pedido apenas encerra", async () => {
    expect(await server.requestClosing(lucas, outingId, t0)).toEqual({ closed: true });
  });
});
