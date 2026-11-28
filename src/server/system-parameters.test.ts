import { beforeEach, describe, expect, it, vi } from "vitest";
import { systemParameterChanges, systemParameters } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const server = await import("./system-parameters");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let admin: string;

beforeEach(async () => {
  state.db = await createTestDatabase();
  admin = (await seedOuting(db())).lucas.id;
});

describe("valores em vigor", () => {
  it("sem alteração vale o padrão de todos", async () => {
    const values = await server.getParameterValues();
    expect(values["closing.vote_days"]).toBe(3);
    expect(values["reminder.min_interval_hours"]).toBe(24);
    expect((await server.getParameterViews()).every((view) => view.isDefault && view.updatedAt === null)).toBe(true);
  });

  it("o valor salvo passa a valer e aparece como alterado", async () => {
    await server.saveParameter(admin, "closing.vote_days", 5);
    expect((await server.getParameterValues())["closing.vote_days"]).toBe(5);
    const view = (await server.getParameterViews()).find((item) => item.key === "closing.vote_days")!;
    expect(view).toMatchObject({ value: 5, isDefault: false });
    expect(view.updatedAt).not.toBeNull();
  });
});

describe("salvar", () => {
  it("fora dos limites ou com número quebrado é recusado, sem gravar nada", async () => {
    await expect(server.saveParameter(admin, "closing.vote_days", 99)).rejects.toMatchObject({ code: "parameter_out_of_range" });
    await expect(server.saveParameter(admin, "closing.vote_days", 2.5)).rejects.toMatchObject({ code: "parameter_not_integer" });
    await expect(server.saveParameter(admin, "nada.disso", 1)).rejects.toMatchObject({ code: "parameter_unknown" });
    expect(await db().$count(systemParameters)).toBe(0);
    expect(await db().$count(systemParameterChanges)).toBe(0);
  });

  it("registra quem mudou, o valor anterior (o padrão, na primeira vez) e o novo", async () => {
    await server.saveParameter(admin, "dispute.window_days", 10);
    await server.saveParameter(admin, "dispute.window_days", 14);
    const changes = await server.listParameterChanges();
    expect(changes.map((item) => [item.previousValue, item.newValue, item.reset])).toEqual([[10, 14, false], [7, 10, false]]);
    expect(changes[0]).toMatchObject({ changedByName: "Lucas", label: "Prazo para contestar depois de encerrado" });
  });

  it("salvar o mesmo valor que já vale não cria registro", async () => {
    await server.saveParameter(admin, "closing.vote_days", 3);
    expect(await db().$count(systemParameterChanges)).toBe(0);
    await server.saveParameter(admin, "closing.vote_days", 5);
    await server.saveParameter(admin, "closing.vote_days", 5);
    expect(await db().$count(systemParameterChanges)).toBe(1);
  });
});

describe("voltar ao padrão", () => {
  it("apaga o valor alterado, registra a volta e o padrão passa a valer", async () => {
    await server.saveParameter(admin, "closing.vote_days", 9);
    await server.resetParameter(admin, "closing.vote_days");
    expect((await server.getParameterValues())["closing.vote_days"]).toBe(3);
    expect(await db().$count(systemParameters)).toBe(0);
    expect((await server.listParameterChanges())[0]).toMatchObject({ previousValue: 9, newValue: 3, reset: true });
  });

  it("voltar ao padrão de quem já está no padrão não registra nada", async () => {
    await server.resetParameter(admin, "closing.vote_days");
    expect(await db().$count(systemParameterChanges)).toBe(0);
  });
});
