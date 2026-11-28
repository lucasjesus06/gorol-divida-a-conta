import { beforeEach, describe, expect, it, vi } from "vitest";
import { amnesties, notifications, outingPayers, people, sharedFunds } from "@/db/schema";
import { approveAccount, createTestDatabase, insertExpense } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const server = await import("./shared-funds");
const balances = await import("./balances");
const paymentsServer = await import("./payments");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

async function confirmedPerson(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

async function expenseBy(payer: string, totalCents: number, shares: Record<string, number>, description = "Despesa") {
  await db().insert(outingPayers).values({ outingId, personId: payer, declaredBy: lucas }).onConflictDoNothing();
  return insertExpense(db(), { outingId, registeredBy: payer, totalCents, description, payers: { [payer]: totalCents }, shares });
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
});

describe("pedir", () => {
  it("lista quem tem conta e divide rolê, e avisa a pessoa pedida", async () => {
    expect((await server.listFundCandidates(lucas)).map((candidate) => candidate.name).sort()).toEqual(["Caio", "Maria"]);
    await server.requestFund(lucas, maria);
    expect(await server.getMyFund(lucas)).toMatchObject({ status: "pending", requestedByMe: true, other: { id: maria, name: "Maria" } });
    expect(await server.getMyFund(maria)).toMatchObject({ status: "pending", requestedByMe: false });
    expect(await server.getMyFund(caio)).toBeNull();
    const [notice] = await db().select().from(notifications);
    expect(notice).toMatchObject({ personId: maria, kind: "shared_fund_requested", url: "/configuracoes/despesas-compartilhadas" });
  });

  it("recusa a si mesmo, quem não divide rolê e quem já está em outra declaração", async () => {
    await expect(server.requestFund(lucas, lucas)).rejects.toMatchObject({ code: "shared_fund_same_person" });
    const [stranger] = await db().insert(people).values({ displayName: "Intruso", phone: "+5511988880000" }).returning();
    await approveAccount(db(), stranger.id);
    await expect(server.requestFund(lucas, stranger.id)).rejects.toMatchObject({ code: "shared_fund_person_not_available" });
    await server.requestFund(lucas, maria);
    await expect(server.requestFund(lucas, caio)).rejects.toMatchObject({ code: "shared_fund_already_declared" });
    await expect(server.requestFund(caio, maria)).rejects.toMatchObject({ code: "shared_fund_person_busy" });
  });
});

describe("aceitar", () => {
  it("só a outra pessoa aceita", async () => {
    const id = await server.requestFund(lucas, maria);
    await expect(server.acceptFund(lucas, id)).rejects.toMatchObject({ code: "shared_fund_only_the_other_answers" });
    await expect(server.acceptFund(caio, id)).rejects.toMatchObject({ code: "shared_fund_not_found" });
  });

  it("perdoa na hora a dívida que já existia entre as duas, só entre as duas", async () => {
    await expenseBy(lucas, 10000, { [lucas]: 3333, [maria]: 3333, [caio]: 3334 }, "Pousada");
    const id = await server.requestFund(lucas, maria);
    await server.acceptFund(maria, id);

    expect((await balances.getRelationDetail(lucas, maria)).netCents).toBe(0);
    expect((await balances.getRelationDetail(lucas, caio)).netCents).toBe(3334);
    const [clearing] = await db().select().from(amnesties);
    expect(clearing).toMatchObject({ creditorId: lucas, debtorId: maria, totalCents: 3333 });
    expect(await server.getMyFund(lucas)).toMatchObject({ status: "active" });
    const answered = (await db().select().from(notifications)).filter((notice) => notice.kind === "shared_fund_resolved");
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({ personId: lucas });
  });

  it("quando é o aceitante quem tem a receber, é ele quem perdoa", async () => {
    await expenseBy(maria, 6000, { [lucas]: 3000, [maria]: 3000 }, "Mercado");
    await server.acceptFund(maria, await server.requestFund(lucas, maria));
    const [clearing] = await db().select().from(amnesties);
    expect(clearing).toMatchObject({ creditorId: maria, debtorId: lucas, totalCents: 3000 });
  });

  it("sem dívida antes não cria anistia", async () => {
    await server.acceptFund(maria, await server.requestFund(lucas, maria));
    expect(await db().select().from(amnesties)).toEqual([]);
  });
});

describe("enquanto vale", () => {
  beforeEach(async () => {
    await server.acceptFund(maria, await server.requestFund(lucas, maria));
  });

  it("a despesa nova não gera dívida entre as duas, e com os outros nada muda", async () => {
    await expenseBy(lucas, 9000, { [lucas]: 3000, [maria]: 3000, [caio]: 3000 }, "Churrasco");
    expect((await balances.getRelationDetail(lucas, maria)).netCents).toBe(0);
    expect((await balances.getRelationDetail(lucas, caio)).netCents).toBe(3000);
    const view = await balances.getOutingBalances(caio, outingId);
    expect(view.balances.find((balance) => balance.personId === maria)?.netCents).toBe(0);
    expect(view.smart).toEqual([{ fromId: caio, from: "Caio", toId: lucas, to: "Lucas", amountCents: 3000 }]);
  });

  it("não se paga entre as duas, mas se paga a um terceiro em nome da outra", async () => {
    await expect(paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents: 1000 })).rejects.toMatchObject({ code: "shared_fund_no_payment" });
    await expenseBy(caio, 4000, { [maria]: 4000 }, "Mercado");
    await paymentsServer.declarePayment(lucas, outingId, { toId: caio, amountCents: 4000, onBehalfOfId: maria });
    expect((await balances.getRelationDetail(lucas, maria)).netCents).toBe(0);
    expect((await balances.getRelationDetail(maria, caio)).netCents).toBe(0);
  });

  it("qualquer uma desfaz, o que foi lançado antes fica neutro e o novo volta a valer", async () => {
    await expenseBy(lucas, 6000, { [lucas]: 3000, [maria]: 3000 }, "Durante");
    const fund = await server.getMyFund(maria);
    await server.endFund(maria, fund?.id ?? "");
    expect(await server.getMyFund(lucas)).toBeNull();
    await expenseBy(lucas, 6000, { [lucas]: 3000, [maria]: 3000 }, "Depois");
    expect((await balances.getRelationDetail(lucas, maria)).netCents).toBe(3000);
    expect((await db().select().from(sharedFunds))[0]).toMatchObject({ status: "ended", endedBy: maria });
    await paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents: 1000 });
  });
});

describe("recusar", () => {
  it("guarda como recusada, avisa quem pediu e libera um novo pedido", async () => {
    const id = await server.requestFund(lucas, maria);
    await expect(server.declineFund(lucas, id)).rejects.toMatchObject({ code: "shared_fund_only_the_other_answers" });
    await server.declineFund(maria, id);
    expect(await server.getMyFund(lucas)).toBeNull();
    expect((await db().select().from(notifications)).filter((notice) => notice.kind === "shared_fund_resolved")).toHaveLength(1);
    await server.requestFund(lucas, caio);
  });

  it("não se desfaz o que ainda não foi aceito", async () => {
    const id = await server.requestFund(lucas, maria);
    await expect(server.endFund(lucas, id)).rejects.toMatchObject({ code: "shared_fund_not_active" });
  });
});
