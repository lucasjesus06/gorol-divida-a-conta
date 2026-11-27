import { beforeEach, describe, expect, it, vi } from "vitest";
import { outingParticipants, people } from "@/db/schema";
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
const server = await import("./balances");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

async function person(name: string, phone: string, outing: string, account = true) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  if (account) {
    await approveAccount(db(), row.id);
  }
  await db().insert(outingParticipants).values({ outingId: outing, personId: row.id, displayName: name });
  return row.id;
}

const day = new Date("2026-03-10T20:00:00Z");
const split = (personIds: string[]) => ({ method: "equal" as const, personIds });

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await person("Maria", "11999990001", outingId);
  caio = await person("Caio", "11999990002", outingId);
  await expensesServer.registerExpense(lucas, outingId, {
    description: "Carne",
    totalCents: 10000,
    payers: [{ personId: lucas, amountCents: 10000 }],
    split: split([lucas, maria, caio]),
    occurredAt: day,
  });
});

describe("saldo do rolê", () => {
  it("quem pagou tem a receber, os outros devem, e a soma dá zero", async () => {
    const view = await server.getOutingBalances(lucas, outingId);
    const byName = Object.fromEntries(view.balances.map((balance) => [balance.name, balance.netCents]));
    expect(byName).toEqual({ Lucas: 6666, Maria: -3333, Caio: -3333 });
    expect(view.balances.reduce((sum, balance) => sum + balance.netCents, 0)).toBe(0);
  });

  it("o resumo de quem deve mostra devido, pago e pendente", async () => {
    const view = await server.getOutingBalances(maria, outingId);
    expect(view.mine).toMatchObject({ originalDebtCents: 3333, paidCents: 0, pendingCents: 3333, netCents: -3333 });
  });

  it("a rota inteligente leva quem deve direto a quem recebe, e a manual coincide aqui", async () => {
    const view = await server.getOutingBalances(lucas, outingId);
    expect(view.smart.map((t) => [t.from, t.to, t.amountCents]).sort()).toEqual([
      ["Caio", "Lucas", 3333],
      ["Maria", "Lucas", 3333],
    ]);
    expect(view.manual).toHaveLength(2);
    expect(view.transfersSaved).toBe(0);
  });

  it("pagamento confirmado reduz o saldo; declarado já conta na rota para ninguém pagar duas vezes", async () => {
    const declared = await paymentsServer.declarePayment(maria, outingId, { toId: lucas, amountCents: 3333 });
    let view = await server.getOutingBalances(lucas, outingId);
    expect(view.smart.map((t) => t.from)).toEqual(["Caio"]);
    expect(view.balances.find((balance) => balance.name === "Maria")?.netCents).toBe(0);

    await paymentsServer.confirmPayment(lucas, outingId, declared);
    view = await server.getOutingBalances(lucas, outingId);
    expect(view.balances.find((balance) => balance.name === "Maria")).toMatchObject({ netCents: 0, sentCents: 3333 });
    expect(view.mine.netCents).toBe(3333);
  });

  it("quem não participa do rolê não vê o saldo", async () => {
    const [fora] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.getOutingBalances(fora.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
  });
});

describe("relação entre pessoas, em todos os rolês", () => {
  async function secondOuting() {
    const other = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Pizza", kind: "event" });
    const mariaThere = await db().insert(outingParticipants).values({ outingId: other, personId: maria, displayName: "Maria" }).returning();
    expect(mariaThere).toHaveLength(1);
    await expensesServer.declarePayer(lucas, other, maria);
    await expensesServer.registerExpense(maria, other, {
      description: "Pizza",
      totalCents: 30000,
      payers: [{ personId: maria, amountCents: 30000 }],
      split: split([lucas, maria]),
      occurredAt: new Date("2026-03-20T20:00:00Z"),
    });
    return other;
  }

  it("soma os rolês, e a direção da dívida inverte quando o outro passa a ter mais a receber", async () => {
    const before = (await server.getRelations(lucas)).find((relation) => relation.name === "Maria");
    expect(before).toMatchObject({ isAccount: true, netCents: 3333 });

    const other = await secondOuting();
    const after = (await server.getRelations(lucas)).find((relation) => relation.name === "Maria");
    expect(after?.netCents).toBe(3333 - 15000);
    expect(after?.byOuting.map((item) => [item.outingName, item.netCents]).sort()).toEqual([
      ["Churrasco", 3333],
      ["Pizza", -15000],
    ]);
    expect(other).toBeDefined();
  });

  it("quem não tem conta não entra na soma entre rolês: só aparece por rolê", async () => {
    const guest = await person("Convidado", "11999990077", outingId, false);
    await expensesServer.registerExpense(lucas, outingId, {
      description: "Bebida",
      totalCents: 2000,
      payers: [{ personId: lucas, amountCents: 2000 }],
      split: split([lucas, guest]),
      occurredAt: day,
    });
    const relation = (await server.getRelations(lucas)).find((item) => item.otherId === guest);
    expect(relation).toMatchObject({ isAccount: false, netCents: null });
    expect(relation?.byOuting).toEqual([{ outingId, outingName: "Churrasco", netCents: 1000 }]);
  });

  it("o detalhe mostra de onde veio cada valor, por rolê, com pagamentos", async () => {
    await secondOuting();
    const paymentId = await paymentsServer.declarePayment(lucas, outingId, { toId: maria, amountCents: 1000 }).catch(() => null);
    expect(paymentId).not.toBeNull();
    const detail = await server.getRelationDetail(lucas, maria);
    expect(detail.entries.map((entry) => [entry.outingName, entry.label])).toEqual([
      ["Churrasco", "Carne"],
      ["Pizza", "Pizza"],
      ["Churrasco", "Pagamento"],
    ]);
  });

  it("pessoa que não divide rolê comigo não tem detalhe", async () => {
    const [fora] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.getRelationDetail(lucas, fora.id)).rejects.toMatchObject({ code: "person_not_found" });
  });
});
