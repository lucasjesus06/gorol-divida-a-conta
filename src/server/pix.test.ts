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
const server = await import("./pix");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let caio: string;
let outingId: string;

async function person(name: string, phone: string, outing: string) {
  const [row] = await db().insert(people).values({ displayName: name, phone: `+55${phone}` }).returning({ id: people.id });
  await approveAccount(db(), row.id);
  await db().insert(outingParticipants).values({ outingId: outing, personId: row.id, displayName: name });
  return row.id;
}

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
    totalCents: 9000,
    payers: [{ personId: lucas, amountCents: 9000 }],
    split: { method: "equal", personIds: [lucas, maria, caio] },
    occurredAt: new Date("2026-03-10T20:00:00Z"),
    idempotencyKey: crypto.randomUUID(),
  });
});

describe("chave Pix", () => {
  it("salva normalizada e só a própria pessoa a lê de volta", async () => {
    expect(await server.hasPixKey(lucas)).toBe(false);
    await server.savePixKey(lucas, { type: "cpf", value: "529.982.247-25" });
    expect(await server.hasPixKey(lucas)).toBe(true);
    expect(await server.getMyPixKey(lucas)).toMatchObject({ type: "cpf", value: "52998224725", display: "529.982.247-25" });
  });

  it("recusa chave inválida sem gravar", async () => {
    await expect(server.savePixKey(lucas, { type: "cpf", value: "111.111.111-11" })).rejects.toMatchObject({ code: "invalid_pix_key" });
    expect(await server.hasPixKey(lucas)).toBe(false);
  });
});

describe("Pix para quem eu devo", () => {
  it("entrega o copia e cola a quem deve, no valor pedido", async () => {
    await server.savePixKey(lucas, { type: "email", value: "lucas@exemplo.com" });
    const pix = await server.getPixPayment(maria, outingId, lucas, 3000);
    expect(pix.display).toBe("lucas@exemplo.com");
    expect(pix.payload).toContain("lucas@exemplo.com");
    expect(pix.payload).toContain("540530.00");
  });

  it("não entrega a chave a quem não deve nada ao dono dela", async () => {
    await server.savePixKey(maria, { type: "email", value: "maria@exemplo.com" });
    await expect(server.getPixPayment(lucas, outingId, maria, 100)).rejects.toMatchObject({ code: "pix_not_allowed" });
    await expect(server.getPixPayment(caio, outingId, maria, 100)).rejects.toMatchObject({ code: "pix_not_allowed" });
  });

  it("não entrega acima do que é devido", async () => {
    await server.savePixKey(lucas, { type: "email", value: "lucas@exemplo.com" });
    await expect(server.getPixPayment(maria, outingId, lucas, 3001)).rejects.toMatchObject({ code: "pix_not_allowed" });
  });

  it("entrega a chave de quem a rota manda pagar, até o valor da rota", async () => {
    await expensesServer.declarePayer(lucas, outingId, maria);
    await expensesServer.registerExpense(maria, outingId, {
      description: "Gelo",
      totalCents: 3000,
      payers: [{ personId: maria, amountCents: 3000 }],
      split: { method: "equal", personIds: [maria, caio] },
      occurredAt: new Date("2026-03-10T21:00:00Z"),
    });
    // Caio deve 3000 direto ao Lucas, mas a rota inteligente manda ele pagar 4500 ao Lucas.
    await server.savePixKey(lucas, { type: "email", value: "lucas@exemplo.com" });
    expect((await server.getPixPayment(caio, outingId, lucas, 4500)).display).toBe("lucas@exemplo.com");
    await expect(server.getPixPayment(caio, outingId, lucas, 4501)).rejects.toMatchObject({ code: "pix_not_allowed" });
  });

  it("avisa quando o credor ainda não cadastrou a chave", async () => {
    await expect(server.getPixPayment(maria, outingId, lucas, 3000)).rejects.toMatchObject({ code: "no_pix_key" });
  });
});
