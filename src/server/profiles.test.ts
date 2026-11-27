import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { people } from "@/db/schema";
import { createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const { loadProfile, saveProfile } = await import("./profiles");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

const ANA = "11111111-1111-4111-8111-111111111111";
const BRUNO = "22222222-2222-4222-8222-222222222222";

async function authUser(id: string) {
  await db().execute(sql`insert into auth.users (id, email) values (${id}, ${`${id}@exemplo.com`})`);
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  await authUser(ANA);
  await authUser(BRUNO);
});

describe("perfil da conta", () => {
  it("não existe até a pessoa informar nome e telefone", async () => {
    expect(await loadProfile(ANA)).toBeNull();
  });

  it("cria a pessoa com o telefone informado", async () => {
    const profile = await saveProfile(ANA, { displayName: "Ana", phone: "+5511999990001" });

    expect(profile.displayName).toBe("Ana");
    expect(await loadProfile(ANA)).toEqual(profile);
    expect(await db().$count(people)).toBe(1);
  });

  it("assume a pessoa que o dono de um rolê já cadastrou com o mesmo telefone", async () => {
    const [cadastrada] = await db()
      .insert(people)
      .values({ displayName: "Aninha", phone: "+5511999990001" })
      .returning();

    const profile = await saveProfile(ANA, { displayName: "Ana", phone: "+5511999990001" });

    expect(profile.personId).toBe(cadastrada.id);
    expect(await db().$count(people)).toBe(1);
    expect(await loadProfile(ANA)).toEqual({ personId: cadastrada.id, displayName: "Ana" });
  });

  it("não deixa outra conta ficar com um telefone que já tem dono", async () => {
    await saveProfile(ANA, { displayName: "Ana", phone: "+5511999990001" });

    await expect(saveProfile(BRUNO, { displayName: "Bruno", phone: "+5511999990001" })).rejects.toMatchObject({
      code: "phone_already_linked",
    });
    expect(await loadProfile(BRUNO)).toBeNull();
  });

  it("salvar de novo devolve o mesmo perfil, sem criar outro", async () => {
    const first = await saveProfile(ANA, { displayName: "Ana", phone: "+5511999990001" });
    const again = await saveProfile(ANA, { displayName: "Outro nome", phone: "+5511999990002" });

    expect(again).toEqual(first);
    expect(await db().$count(people)).toBe(1);
  });
});
