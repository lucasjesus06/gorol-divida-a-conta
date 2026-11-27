import { beforeEach, describe, expect, it, vi } from "vitest";
import { payments, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const server = await import("./payments");

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

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  maria = await confirmedPerson("Maria", "11999990001");
  caio = await confirmedPerson("Caio", "11999990002");
});

describe("declarar pagamento", () => {
  it("fica declarado e aparece para todos do rolê, com a ação só para quem recebe", async () => {
    const id = await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 2500 });

    const [forCreditor] = await server.listPayments(lucas, outingId);
    expect(forCreditor).toMatchObject({ id, status: "declared", amountCents: 2500, canResolve: true });
    expect(forCreditor.from.name).toBe("Maria");
    expect(forCreditor.to.name).toBe("Lucas");
    expect((await server.listPayments(caio, outingId))[0].canResolve).toBe(false);
    expect((await server.listPayments(maria, outingId))[0].canResolve).toBe(false);
  });

  it("pagar em nome de outra pessoa guarda quem foi quitado", async () => {
    await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 1000, onBehalfOfId: caio });
    expect((await server.listPayments(lucas, outingId))[0].onBehalfOf).toEqual({ id: caio, name: "Caio" });
  });

  it("recusa a si mesmo, valor inválido e gente de fora, sem gravar nada", async () => {
    await expect(server.declarePayment(maria, outingId, { toId: maria, amountCents: 100 })).rejects.toMatchObject({ code: "payment_to_self" });
    await expect(server.declarePayment(maria, outingId, { toId: lucas, amountCents: 0 })).rejects.toMatchObject({ code: "invalid_amount" });
    await expect(server.declarePayment(maria, outingId, { toId: lucas, amountCents: 100, onBehalfOfId: lucas })).rejects.toMatchObject({ code: "invalid_on_behalf_of" });
    const [fora] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.declarePayment(maria, outingId, { toId: fora.id, amountCents: 100 })).rejects.toMatchObject({ code: "person_not_in_outing" });
    expect(await db().$count(payments)).toBe(0);
  });

  it("declarar duas vezes com a mesma chave não duplica", async () => {
    const first = await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 100, idempotencyKey: "k" });
    expect(await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 100, idempotencyKey: "k" })).toBe(first);
    expect(await db().$count(payments)).toBe(1);
  });

  it("quem não participa não enxerga nem declara", async () => {
    const [fora] = await db().insert(people).values({ displayName: "Fora", phone: "+5511999990099" }).returning();
    await expect(server.declarePayment(fora.id, outingId, { toId: lucas, amountCents: 100 })).rejects.toMatchObject({ code: "outing_not_found" });
    await expect(server.listPayments(fora.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
  });
});

describe("confirmar e recusar", () => {
  it("o credor confirma, e o pagamento passa a valer", async () => {
    const id = await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 2500 });
    await server.confirmPayment(lucas, outingId, id);
    expect((await server.listPayments(lucas, outingId))[0]).toMatchObject({ status: "confirmed", confirmedBy: "creditor", canResolve: false });
  });

  it("o credor recusa, e fica registrado como recusado", async () => {
    const id = await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 2500 });
    await server.rejectPayment(lucas, outingId, id);
    expect((await server.listPayments(lucas, outingId))[0].status).toBe("rejected");
  });

  it("só o credor decide, e uma vez só", async () => {
    const id = await server.declarePayment(maria, outingId, { toId: lucas, amountCents: 2500 });
    await expect(server.confirmPayment(maria, outingId, id)).rejects.toMatchObject({ code: "only_creditor_resolves" });
    await expect(server.rejectPayment(caio, outingId, id)).rejects.toMatchObject({ code: "only_creditor_resolves" });
    await server.confirmPayment(lucas, outingId, id);
    await expect(server.rejectPayment(lucas, outingId, id)).rejects.toMatchObject({ code: "payment_already_resolved" });
  });

  it("pagamento inexistente", async () => {
    await expect(server.confirmPayment(lucas, outingId, crypto.randomUUID())).rejects.toMatchObject({ code: "payment_not_found" });
  });
});
