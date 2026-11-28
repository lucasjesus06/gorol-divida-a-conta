import { beforeEach, describe, expect, it, vi } from "vitest";
import { outingSettings, people } from "@/db/schema";
import { NO_OVERRIDES } from "@/domain/outing-settings";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const outingsServer = await import("./outings");
const params = await import("./system-parameters");
const lifecycle = await import("./outing-lifecycle");
const server = await import("./outing-settings");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;
let outingId: string;

beforeEach(async () => {
  state.db = await createTestDatabase();
  const [owner] = await db().insert(people).values({ displayName: "Lucas", phone: "+5511999990000" }).returning();
  await approveAccount(db(), owner.id);
  lucas = owner.id;
  outingId = await outingsServer.createOuting({ personId: lucas, displayName: "Lucas" }, { name: "Churrasco", kind: "event" });
  const [row] = await db().insert(people).values({ displayName: "Maria", phone: "+5511999990001" }).returning();
  await approveAccount(db(), row.id);
  await outingsServer.addParticipant(lucas, outingId, { name: "Maria", phone: "11999990001" });
  maria = row.id;
});

describe("ajustes do rolê", () => {
  it("sem escolha do dono valem os padrões, e os participantes enxergam o que vale", async () => {
    const view = await server.getOutingSettings(maria, outingId);
    expect(view.overrides).toEqual(NO_OVERRIDES);
    expect(view.effective).toEqual({ voteDays: 3, disputeWindowDays: 7, defaultSplit: "equal", suggestedRoute: "smart", serviceFeePercent: 0 });
    expect(view.canEdit).toBe(false);
    expect((await server.getOutingSettings(lucas, outingId)).canEdit).toBe(true);
  });

  it("o dono escolhe, e a escolha vence o padrão do sistema; vazio volta ao padrão", async () => {
    await params.saveParameter(lucas, "closing.vote_days", 5);
    await server.saveOutingSettings(lucas, outingId, { ...NO_OVERRIDES, voteDays: 2, defaultSplit: "exact", serviceFeePercent: 10 });
    expect((await server.getOutingSettings(maria, outingId)).effective).toMatchObject({ voteDays: 2, defaultSplit: "exact", serviceFeePercent: 10 });
    expect((await server.getOutingSettings(maria, outingId)).defaults.voteDays).toBe(5);

    await server.saveOutingSettings(lucas, outingId, NO_OVERRIDES);
    expect((await server.getEffectiveSettings(outingId)).voteDays).toBe(5);
    expect(await db().$count(outingSettings)).toBe(1);
  });

  it("só o dono altera, e só com o rolê aberto", async () => {
    await expect(server.saveOutingSettings(maria, outingId, { ...NO_OVERRIDES, voteDays: 2 })).rejects.toMatchObject({ code: "only_admin_manages_outing" });
    await lifecycle.closeOuting(lucas, outingId);
    await expect(server.saveOutingSettings(lucas, outingId, { ...NO_OVERRIDES, voteDays: 2 })).rejects.toMatchObject({ code: "outing_closed" });
  });

  it("recusa o que passa dos limites do sistema sem gravar", async () => {
    await expect(server.saveOutingSettings(lucas, outingId, { ...NO_OVERRIDES, voteDays: 30 })).rejects.toMatchObject({ code: "parameter_out_of_range" });
    expect(await db().$count(outingSettings)).toBe(0);
  });

  it("quem está fora do rolê não vê os ajustes", async () => {
    const [stranger] = await db().insert(people).values({ displayName: "Intruso", phone: "+5511999990009" }).returning();
    await approveAccount(db(), stranger.id);
    await expect(server.getOutingSettings(stranger.id, outingId)).rejects.toMatchObject({ code: "outing_not_found" });
  });
});
