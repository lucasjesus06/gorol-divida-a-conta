import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumptionBills, notifications, people } from "@/db/schema";
import { approveAccount, createTestDatabase, insertBill } from "@/test/database";

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
    mode: "detailed" as const,
    ...overrides,
  };
}

const closeMarks = (by: string, id: string, leftover: { mode: "spread" } | { mode: "transfer"; personId: string } = { mode: "spread" }) =>
  server.closeBill(by, outingId, id, { payers: [{ personId: lucas, amountCents: 6600 }], division: { kind: "marks" }, leftover });

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
  it("guarda os itens e a taxa, com o total calculado; ninguém informa quem pagou ainda", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const bill = await server.getBill(maria, outingId, id);
    expect(bill).toMatchObject({ description: "Bar do Zé", status: "open", mode: "detailed", totalCents: 6600, serviceChargeCents: 600, payers: [], payersFixed: false });
    expect(bill.items.map((item) => [item.description, item.quantity, item.remaining, item.addedBy.name])).toEqual([
      ["Pizza", "1", "1", "Lucas"],
      ["Porção", "1", "1", "Lucas"],
    ]);
  });

  it("qualquer participante abre, sem ser dono nem pagante declarado", async () => {
    const id = await server.openBill(maria, outingId, barBill());
    expect((await server.getBill(lucas, outingId, id)).openedBy.name).toBe("Maria");
  });

  it("pode abrir vazia e ir lançando; descrição obrigatória e quantidade válida", async () => {
    expect(await server.openBill(maria, outingId, barBill({ items: [] }))).toBeTruthy();
    await expect(server.openBill(lucas, outingId, barBill({ description: "  " }))).rejects.toMatchObject({ code: "description_required" });
    await expect(server.openBill(lucas, outingId, barBill({ items: [{ description: "x", totalCents: 100, quantity: "abc" }] }))).rejects.toMatchObject({ code: "invalid_quantity" });
  });

  it("a conta direta guarda só o valor, sem itens", async () => {
    const id = await server.openBill(maria, outingId, { description: "Mercado", occurredAt: new Date(), mode: "direct", directTotalCents: 8000 });
    const bill = await server.getBill(maria, outingId, id);
    expect(bill).toMatchObject({ mode: "direct", totalCents: 8000, items: [], canAddItem: false });
    await expect(server.openBill(maria, outingId, { description: "Mercado", occurredAt: new Date(), mode: "direct" })).rejects.toMatchObject({ code: "direct_total_invalid" });
  });

  it("abrir de novo com a mesma chave não duplica", async () => {
    const first = await server.openBill(lucas, outingId, barBill({ idempotencyKey: "k" }));
    expect(await server.openBill(lucas, outingId, barBill({ idempotencyKey: "k" }))).toBe(first);
    expect(await db().$count(consumptionBills)).toBe(1);
  });

  it("rolê encerrado não aceita conta nova", async () => {
    await (await import("./outing-lifecycle")).closeOuting(lucas, outingId);
    await expect(server.openBill(lucas, outingId, barBill())).rejects.toMatchObject({ code: "outing_closed" });
  });
});

describe("lançar itens à medida que se consome", () => {
  it("qualquer participante adiciona, e a conta mostra o total até agora e quem lançou", async () => {
    const id = await server.openBill(lucas, outingId, barBill({ items: [], serviceChargeCents: 0 }));
    await server.addBillItem(maria, outingId, id, { description: "Cerveja", totalCents: 1200, quantity: "2" });
    await server.addBillItem(caio, outingId, id, { description: "Porção", totalCents: 3000, quantity: "" });
    const bill = await server.getBill(lucas, outingId, id);
    expect(bill.totalCents).toBe(4200);
    expect(bill.items.map((item) => [item.description, item.addedBy.name, item.quantity])).toEqual([["Cerveja", "Maria", "2"], ["Porção", "Caio", "1"]]);
    expect(bill.canAddItem).toBe(true);
  });

  it("quem lançou, quem abriu e o dono mudam ou removem; os outros não", async () => {
    const id = await server.openBill(maria, outingId, barBill({ items: [], serviceChargeCents: 0 }));
    const itemId = await server.addBillItem(caio, outingId, id, { description: "Suco", totalCents: 1500, quantity: "1" });
    await server.updateBillItem(caio, outingId, id, itemId, { description: "Suco grande", totalCents: 1800, quantity: "1" });
    await server.updateBillItem(maria, outingId, id, itemId, { description: "Suco grande", totalCents: 1700, quantity: "1" });
    expect((await server.getBill(lucas, outingId, id)).items[0]).toMatchObject({ totalCents: 1700, canEdit: true });
    const third = await confirmedPerson("Bia", "11999990003");
    await expect(server.updateBillItem(third, outingId, id, itemId, { description: "x", totalCents: 1, quantity: "1" })).rejects.toMatchObject({ code: "item_not_yours" });
    expect((await server.getBill(third, outingId, id)).items[0].canEdit).toBe(false);
    await server.removeBillItem(lucas, outingId, id, itemId);
    expect((await server.getBill(lucas, outingId, id)).items).toEqual([]);
  });

  it("item marcado por alguém não muda nem some", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1/2" });
    await expect(server.updateBillItem(lucas, outingId, id, pizza, { description: "Pizza", totalCents: 1, quantity: "1" })).rejects.toMatchObject({ code: "item_has_claims" });
    await expect(server.removeBillItem(lucas, outingId, id, pizza)).rejects.toMatchObject({ code: "item_has_claims" });
  });

  it("conta fechada ou só de valor não aceita item", async () => {
    const direct = await server.openBill(maria, outingId, { description: "Mercado", occurredAt: new Date(), mode: "direct", directTotalCents: 8000 });
    await expect(server.addBillItem(maria, outingId, direct, { description: "x", totalCents: 100, quantity: "1" })).rejects.toMatchObject({ code: "bill_without_items_mode" });
    const id = await server.openBill(lucas, outingId, barBill());
    await closeMarks(lucas, id);
    await expect(server.addBillItem(maria, outingId, id, { description: "x", totalCents: 100, quantity: "1" })).rejects.toMatchObject({ code: "bill_already_closed" });
  });

  it("taxa, desconto e valor da conta direta mudam só com a conta aberta, por quem abriu ou pelo dono", async () => {
    const id = await server.openBill(maria, outingId, barBill({ serviceChargeCents: 0 }));
    await server.updateBillAmounts(maria, outingId, id, { serviceChargeCents: 500, discountCents: 100 });
    expect(await server.getBill(lucas, outingId, id)).toMatchObject({ serviceChargeCents: 500, discountCents: 100, totalCents: 6400 });
    await expect(server.updateBillAmounts(caio, outingId, id, { serviceChargeCents: 1 })).rejects.toMatchObject({ code: "only_opener_or_admin_closes_bill" });
    await expect(server.updateBillAmounts(maria, outingId, id, { serviceChargeCents: -1 })).rejects.toMatchObject({ code: "amount_negative" });

    const direct = await server.openBill(maria, outingId, { description: "Mercado", occurredAt: new Date(), mode: "direct", directTotalCents: 8000 });
    await server.updateBillAmounts(maria, outingId, direct, { directTotalCents: 9000 });
    expect((await server.getBill(maria, outingId, direct)).totalCents).toBe(9000);
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
    expect(await closeMarks(lucas, id, { mode: "spread" })).toEqual({ status: "closed" });

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
    await closeMarks(lucas, id, { mode: "transfer", personId: lucas });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    const byName = Object.fromEntries(expense.shares.map((share) => [share.name, share.amountCents]));
    expect(byName.Maria).toBe(Math.round((4000 / 2) * 1.1));
    expect(byName.Caio).toBe(Math.round((4000 / 4) * 1.1));
    expect(Object.values(byName).reduce((sum, value) => sum + value, 0)).toBe(6600);
  });

  it("transferir para outra pessoa espera o aceite; quem recebe aceita e a conta fecha", async () => {
    const id = await marked();
    expect(await closeMarks(lucas, id, { mode: "transfer", personId: caio })).toEqual({ status: "awaiting_acceptance" });
    expect((await server.getBill(caio, outingId, id)).mustAcceptLeftover).toBe(true);
    expect(await expensesServer.listExpenses(lucas, outingId)).toEqual([]);
    await expect(server.answerLeftover(maria, outingId, id, true)).rejects.toMatchObject({ code: "not_the_recipient" });

    await server.answerLeftover(caio, outingId, id, true);
    expect((await server.getBill(lucas, outingId, id)).status).toBe("closed");
    expect(await expensesServer.listExpenses(lucas, outingId)).toHaveLength(1);
  });

  it("avisa quem recebeu a parte transferida, com o caminho da conta", async () => {
    const id = await marked();
    await closeMarks(lucas, id, { mode: "transfer", personId: caio });

    const [notice] = await db().select().from(notifications);
    expect(notice).toMatchObject({ personId: caio, kind: "bill_part_transferred", url: `/roles/${outingId}/contas/${id}` });
  });

  it("se quem recebe recusa, a conta volta a ficar aberta para escolher de novo", async () => {
    const id = await marked();
    await closeMarks(lucas, id, { mode: "transfer", personId: caio });
    await server.answerLeftover(caio, outingId, id, false);
    const bill = await server.getBill(lucas, outingId, id);
    expect(bill).toMatchObject({ status: "open", leftoverTo: null });
    await closeMarks(lucas, id, { mode: "spread" });
    expect((await server.getBill(lucas, outingId, id)).status).toBe("closed");
  });

  it("enquanto espera o aceite, ninguém mexe nas marcações; fechada, nada muda", async () => {
    const id = await marked();
    const { pizza } = await itemIds(id);
    await closeMarks(lucas, id, { mode: "transfer", personId: caio });
    await expect(server.claimItem(caio, outingId, id, pizza, { quantity: "1/8" })).rejects.toMatchObject({ code: "bill_already_closed" });
    await server.answerLeftover(caio, outingId, id, true);
    await expect(server.claimItem(maria, outingId, id, pizza, { quantity: "1/8" })).rejects.toMatchObject({ code: "bill_already_closed" });
    await expect(closeMarks(lucas, id, { mode: "spread" })).rejects.toMatchObject({ code: "bill_already_closed" });
  });

  it("só quem abriu ou o dono fecha", async () => {
    const id = await server.openBill(maria, outingId, barBill());
    await expect(closeMarks(caio, id, { mode: "spread" })).rejects.toMatchObject({ code: "only_opener_or_admin_closes_bill" });
    await closeMarks(lucas, id, { mode: "spread" });
    expect((await server.getBill(lucas, outingId, id)).status).toBe("closed");
  });

  it("tudo marcado fecha sem sobra, com a taxa proporcional ao consumo", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza, porcao } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1" });
    await server.claimItem(caio, outingId, id, porcao, { quantity: "1" });
    await closeMarks(lucas, id, { mode: "spread" });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    const byName = Object.fromEntries(expense.shares.map((share) => [share.name, share.amountCents]));
    expect(byName).toEqual({ Maria: 4400, Caio: 2200 });
  });
});

describe("fechar: quem pagou e como dividir", () => {
  const direct = (by = maria) => server.openBill(by, outingId, { description: "Mercado", occurredAt: new Date("2026-03-10T20:00:00Z"), mode: "direct", directTotalCents: 9000 });
  const all = () => [lucas, maria, caio];

  it("conta direta dividida por igual: nasce a despesa com quem pagou e a divisão escolhidos agora", async () => {
    const id = await direct();
    await server.closeBill(lucas, outingId, id, { payers: [{ personId: lucas, amountCents: 9000 }], division: { kind: "equal", personIds: all() } });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    expect(expense).toMatchObject({ totalCents: 9000, splitMethod: "equal", description: "Mercado" });
    expect(expense.payers).toEqual([{ personId: lucas, name: "Lucas", amountCents: 9000 }]);
    expect(expense.shares.map((share) => share.amountCents)).toEqual([3000, 3000, 3000]);
    const bill = await server.getBill(lucas, outingId, id);
    expect(bill).toMatchObject({ status: "closed", resultExpenseId: expense.id });
    expect(bill.payers).toHaveLength(1);
  });

  it("dividir só entre quem participou, ou por valores", async () => {
    const equal = await direct();
    await server.closeBill(lucas, outingId, equal, { payers: [{ personId: lucas, amountCents: 9000 }], division: { kind: "equal", personIds: [lucas, maria] } });
    const exact = await direct();
    await server.closeBill(lucas, outingId, exact, {
      payers: [{ personId: lucas, amountCents: 9000 }],
      division: { kind: "exact", shares: [{ personId: lucas, amountCents: 5000 }, { personId: maria, amountCents: 4000 }] },
    });
    const expenses = await expensesServer.listExpenses(lucas, outingId);
    expect(expenses.map((expense) => [expense.splitMethod, expense.shares.map((share) => share.amountCents)]).sort()).toEqual([["equal", [4500, 4500]], ["exact", [5000, 4000]]].sort());
  });

  it("conta detalhada também pode ser dividida por igual, ignorando as marcações", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    await server.closeBill(lucas, outingId, id, { payers: [{ personId: lucas, amountCents: 6600 }], division: { kind: "equal", personIds: all() } });
    const [expense] = await expensesServer.listExpenses(lucas, outingId);
    expect(expense).toMatchObject({ totalCents: 6600, splitMethod: "equal" });
  });

  it("quem pagou precisa ser o dono ou um pagante declarado, escolhido só no fechamento", async () => {
    const id = await direct();
    await expect(server.closeBill(lucas, outingId, id, { payers: [{ personId: maria, amountCents: 9000 }], division: { kind: "equal", personIds: all() } })).rejects.toMatchObject({ code: "payer_not_declared" });
    await expensesServer.declarePayer(lucas, outingId, maria);
    await server.closeBill(lucas, outingId, id, { payers: [{ personId: maria, amountCents: 9000 }], division: { kind: "equal", personIds: all() } });
    expect((await expensesServer.listExpenses(lucas, outingId))[0].payers[0].name).toBe("Maria");
  });

  it("recusa soma errada de pagamentos e de partes, sem fechar a conta", async () => {
    const id = await direct();
    await expect(server.closeBill(lucas, outingId, id, { payers: [{ personId: lucas, amountCents: 8000 }], division: { kind: "equal", personIds: all() } })).rejects.toMatchObject({ code: "payers_total_mismatch" });
    await expect(server.closeBill(lucas, outingId, id, { payers: [{ personId: lucas, amountCents: 9000 }], division: { kind: "exact", shares: [{ personId: lucas, amountCents: 1000 }] } })).rejects.toMatchObject({ code: "shares_total_mismatch" });
    await expect(server.closeBill(lucas, outingId, id, { division: { kind: "equal", personIds: all() } })).rejects.toMatchObject({ code: "payers_required" });
    expect((await server.getBill(lucas, outingId, id)).status).toBe("open");
    expect(await expensesServer.listExpenses(lucas, outingId)).toEqual([]);
  });

  it("conta direta não divide pelo que cada um marcou, e sem itens a detalhada não fecha", async () => {
    const id = await direct();
    await expect(server.closeBill(lucas, outingId, id, { payers: [{ personId: lucas, amountCents: 9000 }], division: { kind: "marks" } })).rejects.toMatchObject({ code: "marks_need_items" });
    const empty = await server.openBill(lucas, outingId, barBill({ items: [], serviceChargeCents: 0 }));
    await expect(server.closeBill(lucas, outingId, empty, { payers: [{ personId: lucas, amountCents: 100 }], division: { kind: "equal", personIds: all() } })).rejects.toMatchObject({ code: "no_items" });
  });

  it("a conta é fechada uma vez só, mesmo com dois pedidos ao mesmo tempo", async () => {
    const id = await direct();
    const input = { payers: [{ personId: lucas, amountCents: 9000 }], division: { kind: "equal" as const, personIds: all() } };
    const results = await Promise.allSettled([server.closeBill(lucas, outingId, id, input), server.closeBill(lucas, outingId, id, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await expensesServer.listExpenses(lucas, outingId)).toHaveLength(1);
  });

  it("pelo que cada um marcou, passando a parte para outra pessoa, guarda quem pagou e espera o aceite", async () => {
    const id = await server.openBill(lucas, outingId, barBill());
    const { pizza } = await itemIds(id);
    await server.claimItem(maria, outingId, id, pizza, { quantity: "1/2" });
    expect(await server.closeBill(lucas, outingId, id, { payers: [{ personId: lucas, amountCents: 6600 }], division: { kind: "marks" }, leftover: { mode: "transfer", personId: caio } })).toEqual({ status: "awaiting_acceptance" });
    expect((await server.getBill(lucas, outingId, id)).payers).toHaveLength(1);
    await server.answerLeftover(caio, outingId, id, true);
    expect(await expensesServer.listExpenses(lucas, outingId)).toHaveLength(1);
  });

  it("conta aberta pelo fluxo antigo, com quem pagou já registrado, fecha sem perguntar de novo", async () => {
    const legacy = await insertBill(db(), { outingId, openedBy: lucas, payers: { [lucas]: 3000 }, items: [{ description: "Porção", totalCents: 3000 }] });
    const bill = await server.getBill(lucas, outingId, legacy.bill.id);
    expect(bill.payersFixed).toBe(true);
    await server.closeBill(lucas, outingId, legacy.bill.id, { division: { kind: "marks" }, leftover: { mode: "spread" } });
    expect((await server.getBill(lucas, outingId, legacy.bill.id)).status).toBe("closed");
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
