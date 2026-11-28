import { beforeEach, describe, expect, it, vi } from "vitest";
import { amnestyItems, amnesties, notifications, people } from "@/db/schema";
import { approveAccount, createTestDatabase, insertExpense } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const server = await import("./amnesties");
const balances = await import("./balances");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;
let pousada: string;
let quadra: string;

async function confirmedPerson(name: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name, phone });
  return row.id;
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
  pousada = (await insertExpense(db(), { outingId, registeredBy: lucas, totalCents: 10000, description: "Pousada", payers: { [lucas]: 10000 }, shares: { [lucas]: 5000, [maria]: 5000 } })).id;
  quadra = (await insertExpense(db(), { outingId, registeredBy: lucas, totalCents: 4000, description: "Quadra", payers: { [lucas]: 4000 }, shares: { [lucas]: 2000, [maria]: 2000 } })).id;
});

describe("getForgivable", () => {
  it("mostra o que a pessoa deve por despesa e o máximo que dá para perdoar", async () => {
    const view = await server.getForgivable(lucas, maria);
    expect(view.debtor).toEqual({ id: maria, name: "Maria" });
    expect(view.maxCents).toBe(7000);
    expect(view.expenses.map((row) => [row.description, row.remainingCents, row.outingName])).toEqual([
      ["Pousada", 5000, "Churrasco"],
      ["Quadra", 2000, "Churrasco"],
    ]);
  });

  it("quem só deve não tem o que perdoar", async () => {
    expect((await server.getForgivable(maria, lucas)).maxCents).toBe(0);
  });

  it("recusa quem não divide rolê com a pessoa", async () => {
    const [stranger] = await db().insert(people).values({ displayName: "Intruso", phone: "+5511999991111" }).returning();
    await expect(server.getForgivable(lucas, stranger.id)).rejects.toMatchObject({ code: "person_not_found" });
  });
});

describe("grantAmnesty", () => {
  it("registra, reduz o saldo de todo mundo que vê o rolê e avisa o anistiado uma vez", async () => {
    const id = await server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 3000 }, { expenseId: quadra, amountCents: 2000 }]);

    const [header] = await db().select().from(amnesties);
    expect(header).toMatchObject({ id, creditorId: lucas, debtorId: maria, totalCents: 5000 });
    expect(await db().select().from(amnestyItems)).toHaveLength(2);

    expect((await server.getForgivable(lucas, maria)).maxCents).toBe(2000);
    const view = await balances.getOutingBalances(caio, outingId);
    expect(view.balances.find((balance) => balance.personId === maria)?.netCents).toBe(-2000);
    expect(view.balances.find((balance) => balance.personId === lucas)?.netCents).toBe(2000);

    const notices = await db().select().from(notifications);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ personId: maria, kind: "amnesty_granted", url: `/resumo/${lucas}` });
    expect(notices[0].body).toContain("Pousada");
    expect(notices[0].body).toContain("Quadra");
  });

  it("no extrato do par aparece o perdão com o nome do lançamento", async () => {
    await server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 1000 }]);
    const detail = await balances.getRelationDetail(maria, lucas);
    expect(detail.entries.filter((entry) => entry.kind === "amnesty").map((entry) => [entry.label, entry.effectCents])).toEqual([["Dívida perdoada", 1000]]);
    expect(detail.netCents).toBe(-6000);
  });

  it("repetir o mesmo pedido não perdoa nem avisa duas vezes", async () => {
    const idempotencyKey = crypto.randomUUID();
    const first = await server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 1000 }], idempotencyKey);
    const second = await server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 1000 }], idempotencyKey);
    expect(second).toBe(first);
    expect(await db().select().from(amnesties)).toHaveLength(1);
    expect(await db().select().from(notifications)).toHaveLength(1);
  });

  it("dois perdões seguidos não passam do que a despesa tem", async () => {
    await server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 4000 }]);
    await expect(server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 2000 }])).rejects.toMatchObject({ code: "amnesty_above_expense" });
    expect(await db().select().from(amnesties)).toHaveLength(1);
    expect(await db().select().from(notifications)).toHaveLength(1);
  });

  it("dois pedidos ao mesmo tempo, os dois pelo que sobra, só um passa", async () => {
    const attempts = await Promise.allSettled([
      server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 5000 }]),
      server.grantAmnesty(lucas, maria, [{ expenseId: pousada, amountCents: 5000 }]),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await db().select().from(amnesties)).toHaveLength(1);
  });

  it("quem deve não perdoa o credor", async () => {
    await expect(server.grantAmnesty(maria, lucas, [{ expenseId: pousada, amountCents: 100 }])).rejects.toMatchObject({ code: "amnesty_expense_not_owed" });
  });

  it("não perdoa nada sem escolher despesa", async () => {
    await expect(server.grantAmnesty(lucas, maria, [])).rejects.toMatchObject({ code: "amnesty_empty" });
  });
});
