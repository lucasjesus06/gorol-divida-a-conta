import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expenses, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const server = await import("./expenses");

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

const day = new Date("2026-03-10T20:00:00Z");

function churrasco(overrides: Partial<Parameters<typeof server.registerExpense>[2]> = {}) {
  return {
    description: "Churrasco",
    totalCents: 10000,
    payers: [{ personId: lucas, amountCents: 10000 }],
    split: { method: "equal" as const, personIds: [lucas, maria, caio] },
    occurredAt: day,
    ...overrides,
  };
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco de sábado", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
});

describe("pagantes", () => {
  it("o dono é pagante sempre e declara os demais", async () => {
    expect((await server.listPayers(lucas, outingId)).filter((person) => person.isPayer).map((person) => person.name)).toEqual(["Lucas"]);
    await server.declarePayer(lucas, outingId, maria);
    expect((await server.listPayers(lucas, outingId)).filter((person) => person.isPayer).map((person) => person.name)).toEqual(["Lucas", "Maria"]);
  });

  it("só o dono declara, e uma vez só, e só quem está no rolê", async () => {
    await expect(server.declarePayer(maria, outingId, caio)).rejects.toMatchObject({ code: "only_admin_manages_outing" });
    await server.declarePayer(lucas, outingId, maria);
    await expect(server.declarePayer(lucas, outingId, maria)).rejects.toMatchObject({ code: "already_payer" });
    await expect(server.declarePayer(lucas, outingId, lucas)).rejects.toMatchObject({ code: "already_payer" });
    const [stranger] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.declarePayer(lucas, outingId, stranger.id)).rejects.toMatchObject({ code: "person_not_in_outing" });
  });
});

describe("registrar despesa", () => {
  it("divide por igual e o centavo que sobra fica com quem pagou", async () => {
    const id = await server.registerExpense(lucas, outingId, churrasco());
    const detail = await server.getExpense(lucas, outingId, id);
    expect(detail).toMatchObject({ description: "Churrasco", totalCents: 10000, version: 1, status: "active", splitMethod: "equal" });
    expect(Object.fromEntries(detail.shares.map((share) => [share.name, share.amountCents]))).toEqual({ Lucas: 3334, Maria: 3333, Caio: 3333 });
    expect(detail.shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(10000);
    expect(detail.payers).toEqual([{ personId: lucas, name: "Lucas", amountCents: 10000 }]);
  });

  it("divide por valores informados, que precisam fechar com o total", async () => {
    await server.registerExpense(
      lucas,
      outingId,
      churrasco({ split: { method: "exact", shares: [{ personId: lucas, amountCents: 5000 }, { personId: maria, amountCents: 3000 }, { personId: caio, amountCents: 2000 }] } }),
    );
    await expect(
      server.registerExpense(lucas, outingId, churrasco({ split: { method: "exact", shares: [{ personId: lucas, amountCents: 5000 }, { personId: maria, amountCents: 4000 }] } })),
    ).rejects.toThrow();
    expect(await db().$count(expenses)).toBe(1);
  });

  it("só o dono e os pagantes declarados registram", async () => {
    await expect(server.registerExpense(maria, outingId, churrasco({ payers: [{ personId: maria, amountCents: 10000 }] }))).rejects.toMatchObject({
      code: "only_payers_register_expense",
    });
    await server.declarePayer(lucas, outingId, maria);
    await server.registerExpense(maria, outingId, churrasco({ payers: [{ personId: maria, amountCents: 10000 }] }));
  });

  it("quem pagou precisa ser o dono ou um pagante declarado", async () => {
    await expect(server.registerExpense(lucas, outingId, churrasco({ payers: [{ personId: caio, amountCents: 10000 }] }))).rejects.toMatchObject({
      code: "payer_not_declared",
    });
  });

  it("todas as pessoas da despesa estão no rolê", async () => {
    const [stranger] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(
      server.registerExpense(lucas, outingId, churrasco({ split: { method: "equal", personIds: [lucas, stranger.id] } })),
    ).rejects.toMatchObject({ code: "person_not_in_outing" });
  });

  it("registrar duas vezes com a mesma chave não duplica", async () => {
    const first = await server.registerExpense(lucas, outingId, churrasco({ idempotencyKey: "form-1" }));
    const second = await server.registerExpense(lucas, outingId, churrasco({ idempotencyKey: "form-1" }));
    expect(second).toBe(first);
    expect(await db().$count(expenses)).toBe(1);
  });

  it("recusa dados inválidos sem gravar nada", async () => {
    await expect(server.registerExpense(lucas, outingId, churrasco({ description: " " }))).rejects.toMatchObject({ code: "description_required" });
    await expect(server.registerExpense(lucas, outingId, churrasco({ totalCents: 0, payers: [{ personId: lucas, amountCents: 0 }] }))).rejects.toMatchObject({ code: "invalid_amount" });
    await expect(server.registerExpense(lucas, outingId, churrasco({ payers: [{ personId: lucas, amountCents: 9000 }] }))).rejects.toMatchObject({ code: "payers_total_mismatch" });
    expect(await db().$count(expenses)).toBe(0);
  });

  it("rolê encerrado não aceita despesa", async () => {
    const { outings } = await import("@/db/schema");
    await db().update(outings).set({ status: "closed", closedAt: new Date() });
    await expect(server.registerExpense(lucas, outingId, churrasco())).rejects.toMatchObject({ code: "outing_closed" });
  });

  it("quem não participa não enxerga nada", async () => {
    const [stranger] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.registerExpense(stranger.id, outingId, churrasco())).rejects.toMatchObject({ code: "outing_not_found" });
    await expect(server.listExpenses(stranger.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
  });
});

describe("corrigir e anular", () => {
  it("corrigir cria uma nova versão, a anterior fica substituída e o histórico aparece", async () => {
    const first = await server.registerExpense(lucas, outingId, churrasco());
    const second = await server.reviseExpense(lucas, outingId, first, churrasco({ totalCents: 12000, payers: [{ personId: lucas, amountCents: 12000 }] }));

    const list = await server.listExpenses(lucas, outingId);
    expect(list.map((expense) => [expense.id, expense.version, expense.totalCents])).toEqual([[second, 2, 12000]]);
    const detail = await server.getExpense(lucas, outingId, second);
    expect(detail.history.map((version) => [version.version, version.status, version.totalCents])).toEqual([[1, "superseded", 10000]]);
    await expect(server.reviseExpense(lucas, outingId, first, churrasco())).rejects.toMatchObject({ code: "expense_not_active" });
  });

  it("só quem registrou ou o dono corrige e anula", async () => {
    await server.declarePayer(lucas, outingId, maria);
    const byMaria = await server.registerExpense(maria, outingId, churrasco({ payers: [{ personId: maria, amountCents: 10000 }] }));
    const byLucas = await server.registerExpense(lucas, outingId, churrasco());

    await expect(server.voidExpense(maria, outingId, byLucas, "Erro")).rejects.toMatchObject({ code: "only_registrant_or_admin_changes_expense" });
    await expect(server.voidExpense(caio, outingId, byMaria, "Erro")).rejects.toMatchObject({ code: "only_registrant_or_admin_changes_expense" });
    await server.voidExpense(lucas, outingId, byMaria, "Duplicada");
    await expect(server.voidExpense(maria, outingId, byMaria, "de novo")).rejects.toMatchObject({ code: "expense_not_active" });
  });

  it("anular exige o motivo, guarda quem anulou e tira a despesa da lista de ativas", async () => {
    const id = await server.registerExpense(lucas, outingId, churrasco());
    await expect(server.voidExpense(lucas, outingId, id, "  ")).rejects.toMatchObject({ code: "void_reason_required" });
    await server.voidExpense(lucas, outingId, id, " Lançada duas vezes ");

    const [row] = await db().select().from(expenses).where(eq(expenses.id, id));
    expect(row).toMatchObject({ status: "voided", voidedBy: lucas, voidReason: "Lançada duas vezes" });
    expect((await server.listExpenses(lucas, outingId)).map((expense) => expense.status)).toEqual(["voided"]);
  });

  it("anular de novo é recusado", async () => {
    const id = await server.registerExpense(lucas, outingId, churrasco());
    await server.voidExpense(lucas, outingId, id, "Erro");
    await expect(server.voidExpense(lucas, outingId, id, "Erro")).rejects.toMatchObject({ code: "expense_not_active" });
  });
});
