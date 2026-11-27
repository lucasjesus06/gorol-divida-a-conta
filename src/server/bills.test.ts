import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumptionBills, notifications, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const expensesServer = await import("./expenses");
const server = await import("./bills");

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

function barBill(overrides: Partial<Parameters<typeof server.openBill>[2]> = {}) {
  return {
    description: "Bar do Zé",
    occurredAt: new Date("2026-03-10T22:00:00Z"),
    serviceChargeCents: 600,
    discountCents: 0,
    items: [
      { description: "Pizza", totalCents: 4000, quantity: "1" },
      { description: "Porção", totalCents: 2000, quantity: "1" },
    ],
    payers: [{ personId: lucas, amountCents: 6600 }],
    ...overrides,
  };
}

async function itemIds(billId: string) {
  const bill = await server.getBill(lucas, outingId, billId);
  return { pizza: bill.items[0].id, porcao: bill.items[1].id };
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Rolê de sábado", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
});

describe("abrir a conta", () => {
  it("guarda itens, taxa e quem pagou, com o total calculado", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const bill = await server.getBill(maria, outingId, id);
    expect(bill).toMatchObject({ description: "Bar do Zé", status: "open", totalCents: 6600, serviceChargeCents: 600 });
    expect(bill.items.map((item) => [item.description, item.quantity, item.remaining])).toEqual([
      ["Pizza", "1", "1"],
      ["Porção", "1", "1"],
    ]);
  });

  it("só o dono e os pagantes declarados abrem, e o pagamento precisa fechar com o total", async () => {
    await expect(server.openBill(maria, outingId, barBill({ payers: [{ personId: maria, amountCents: 6600 }] }))).rejects.toMatchObject({ code: "only_payers_register_expense" });
    await expect(server.openBill(lucas, outingId, barBill({ payers: [{ personId: lucas, amountCents: 6000 }] }))).rejects.toMatchObject({ code: "payers_total_mismatch" });
    await expect(server.openBill(lucas, outingId, barBill({ items: [] }))).rejects.toMatchObject({ code: "no_items" });
    await expect(server.openBill(lucas, outingId, barBill({ items: [{ description: "x", totalCents: 100, quantity: "abc" }] }))).rejects.toMatchObject({ code: "invalid_quantity" });
    expect(await db().$count(consumptionBills)).toBe(0);
  });

  it("abrir de novo com a mesma chave não duplica", async () => {
    const first = await server.openBill(lucas, outingId, barBill({ idempotencyKey: "k" }));
    expect(await server.openBill(lucas, outingId, barBill({ idempotencyKey: "k" }))).toBe(first);
    expect(await db().$count(consumptionBills)).toBe(1);
  });
});

describe("marcar o consumo", () => {
  it("cada um marca o seu, e o que sobra aparece na conta", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1/2" });
    const bill = await server.getBill(caio, outingId, id);
    expect(bill.items[0].claims).toEqual([{ personId: maria, name: "Maria", quantity: "1/2" }]);
    expect(bill.items[0].remaining).toBe("1/2");
  });

  it("divide o item com outras pessoas em partes exatas, e elas ficam vinculadas", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1", sharedWith: [caio, lucas] });
    const bill = await server.getBill(lucas, outingId, id);
    expect(bill.items[0].claims.map((claim) => claim.quantity)).toEqual(["1/3", "1/3", "1/3"]);
    expect(bill.items[0].remaining).toBe("0");
  });

  it("ninguém marca mais do que sobrou, nem sobrescreve a marcação de quem já marcou", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "3/4" });
    await expect(server.claimItem(caio, outingId, id, pizza, { quantity: "1/2" })).rejects.toMatchObject({ code: "item_over_claimed" });
    await expect(server.claimItem(caio, outingId, id, pizza, { quantity: "1/8", sharedWith: [maria] })).rejects.toMatchObject({ code: "already_claimed_by_other" });
  });

  it("consumi menos: atualiza a própria marcação; não consumi: retira", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1/2" });
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1/4" });
    expect((await server.getBill(maria, outingId, id)).items[0].remaining).toBe("3/4");
    await server.releaseClaim(maria, outingId, id, pizza);
    expect((await server.getBill(maria, outingId, id)).items[0].remaining).toBe("1");
  });

  it("só o dono marca por quem não usa o app", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await expect(server.claimItem(maria, outingId, id, pizza, { quantity: "1/4", forPersonId: caio })).rejects.toMatchObject({ code: "only_admin_claims_for_others" });
    await server.claimItem(lucas, outingId, id, pizza, { quantity: "1/4", forPersonId: caio });
    expect((await server.getBill(lucas, outingId, id)).items[0].claims[0].name).toBe("Caio");
  });
});

describe("fechar a conta", () => {
  async function marked() {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1/2" });
    await server.claimItem(caio, outingId, id, pizza, { quantity: "1/4" });
    return id;
  }

  it("ratear: o que ninguém marcou é dividido entre todos, inclusive quem pagou e quem não marcou nada", async () => {
    const id = await marked();
    expect(await server.closeBill(lucas, outingId, id, { mode: "spread" })).toEqual({ status: "closed" });

    const bill = await server.getBill(lucas, outingId, id);
    expect(bill.status).toBe("closed");
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    expect(expense).toMatchObject({ id: bill.resultExpenseId, totalCents: 6600, splitMethod: "itemized" });
    expect(expense.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(6600);
    expect(expense.shares.find((share) => share.name === "Lucas")?.amountCents).toBeGreaterThan(0);
    expect(expense.shares).toHaveLength(3);
  });

  it("transferir para si mesmo: o que sobrou fica com quem fecha", async () => {
    const id = await marked();
    await server.closeBill(lucas, outingId, id, { mode: "transfer", personId: lucas });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    const byName = Object.fromEntries(expense.shares.map((share) => [share.name, share.amountCents]));
    expect(byName.Maria).toBe(Math.round((4000 / 2) * 1.1));
    expect(byName.Caio).toBe(Math.round((4000 / 4) * 1.1));
    expect(Object.values(byName).reduce((sum, value) => sum + value, 0)).toBe(6600);
  });

  it("transferir para outra pessoa espera o aceite; quem recebe aceita e a conta fecha", async () => {
    const id = await marked();
    expect(await server.closeBill(lucas, outingId, id, { mode: "transfer", personId: caio })).toEqual({ status: "awaiting_acceptance" });
    expect((await server.getBill(caio, outingId, id)).mustAcceptLeftover).toBe(true);
    expect(await expensesServer.listExpenses(lucas, outingId)).toEqual([]);
    await expect(server.answerLeftover(maria, outingId, id, true)).rejects.toMatchObject({ code: "not_the_recipient" });

    await server.answerLeftover(caio, outingId, id, true);
    expect((await server.getBill(lucas, outingId, id)).status).toBe("closed");
    expect(await expensesServer.listExpenses(lucas, outingId)).toHaveLength(1);
  });

  it("avisa quem recebeu a parte transferida, com o caminho da conta", async () => {
    const id = await marked();
    await server.closeBill(lucas, outingId, id, { mode: "transfer", personId: caio });

    const [notice] = await db().select().from(notifications);
    expect(notice).toMatchObject({ personId: caio, kind: "bill_part_transferred", url: `/roles/${outingId}/contas/${id}` });
  });

  it("se quem recebe recusa, a conta volta a ficar aberta para escolher de novo", async () => {
    const id = await marked();
    await server.closeBill(lucas, outingId, id, { mode: "transfer", personId: caio });
    await server.answerLeftover(caio, outingId, id, false);
    const bill = await server.getBill(lucas, outingId, id);
    expect(bill).toMatchObject({ status: "open", leftoverTo: null });
    await server.closeBill(lucas, outingId, id, { mode: "spread" });
    expect((await server.getBill(lucas, outingId, id)).status).toBe("closed");
  });

  it("enquanto espera o aceite, ninguém mexe nas marcações; fechada, nada muda", async () => {
    const id = await marked();
    const { pizza } = await itemIds(id);
    await server.closeBill(lucas, outingId, id, { mode: "transfer", personId: caio });
    await expect(server.claimItem(caio, outingId, id, pizza, { quantity: "1/8" })).rejects.toMatchObject({ code: "bill_already_closed" });
    await server.answerLeftover(caio, outingId, id, true);
    await expect(server.claimItem(maria, outingId, id, pizza, { quantity: "1/8" })).rejects.toMatchObject({ code: "bill_already_closed" });
    await expect(server.closeBill(lucas, outingId, id, { mode: "spread" })).rejects.toMatchObject({ code: "bill_already_closed" });
  });

  it("só quem abriu ou o dono fecha", async () => {
    await expensesServer.declarePayer(lucas, outingId, maria);
    const id = await server.openBill(maria, outingId, barBill({ payers: [{ personId: maria, amountCents: 6600 }] }));
    await expect(server.closeBill(caio, outingId, id, { mode: "spread" })).rejects.toMatchObject({ code: "only_opener_or_admin_closes_bill" });
    await server.closeBill(lucas, outingId, id, { mode: "spread" });
    expect((await server.getBill(lucas, outingId, id)).status).toBe("closed");
  });

  it("tudo marcado fecha sem sobra, com a taxa proporcional ao consumo", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza, porcao } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1" });
    await server.claimItem(caio, outingId, id, porcao, { quantity: "1" });
    await server.closeBill(lucas, outingId, id, { mode: "spread" });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    const byName = Object.fromEntries(expense.shares.map((share) => [share.name, share.amountCents]));
    expect(byName).toEqual({ Maria: 4400, Caio: 2200 });
  });
});

describe("segurança", () => {
  it("quem não participa não enxerga a conta", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const [fora] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.getBill(fora.id, outingId, id)).rejects.toMatchObject({ code: "outing_not_found" });
    const [row] = await db().select().from(consumptionBills).where(eq(consumptionBills.id, id));
    expect(row.status).toBe("open");
  });
});
