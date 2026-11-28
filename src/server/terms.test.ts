import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { termsAcceptances } from "@/db/schema";
import { TERMS_VERSION } from "@/domain/terms";
import { createTestDatabase, seedOuting } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const server = await import("./terms");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;

beforeEach(async () => {
  state.db = await createTestDatabase();
  const seeded = await seedOuting(db());
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
});

describe("aceitar os termos", () => {
  it("antes de aceitar não há aceite; depois, a versão vigente fica registrada", async () => {
    expect(await server.hasAcceptedTerms(lucas)).toBe(false);
    await server.acceptTerms(lucas, { acceptedTerms: true, acceptedReminders: true });
    expect(await server.hasAcceptedTerms(lucas)).toBe(true);
    expect(await server.getAcceptance(lucas)).toMatchObject({ version: TERMS_VERSION, remindersConsent: true, remindersWithdrawnAt: null });
    expect(await server.hasAcceptedTerms(maria)).toBe(false);
  });

  it("exige os dois aceites e não grava nada sem eles", async () => {
    await expect(server.acceptTerms(lucas, { acceptedTerms: false, acceptedReminders: true })).rejects.toMatchObject({ code: "terms_not_accepted" });
    await expect(server.acceptTerms(lucas, { acceptedTerms: true, acceptedReminders: false })).rejects.toMatchObject({ code: "reminders_consent_required" });
    expect(await db().$count(termsAcceptances)).toBe(0);
  });

  it("aceitar de novo não duplica nem apaga a retirada do consentimento", async () => {
    await server.acceptTerms(lucas, { acceptedTerms: true, acceptedReminders: true });
    await server.withdrawRemindersConsent(lucas);
    await server.acceptTerms(lucas, { acceptedTerms: true, acceptedReminders: true });
    expect(await db().$count(termsAcceptances)).toBe(1);
    expect((await server.getAcceptance(lucas))!.remindersWithdrawnAt).not.toBeNull();
  });

  it("aceite de versão antiga não vale para a vigente", async () => {
    await db().insert(termsAcceptances).values({ personId: lucas, version: "2020-01-01", remindersConsent: true });
    expect(await server.hasAcceptedTerms(lucas)).toBe(false);
  });
});

describe("consentimento dos lembretes", () => {
  it("retira e devolve, sem mexer no aceite dos termos", async () => {
    await server.acceptTerms(lucas, { acceptedTerms: true, acceptedReminders: true });
    await server.withdrawRemindersConsent(lucas);
    expect((await server.getAcceptance(lucas))!.remindersWithdrawnAt).not.toBeNull();
    expect(await server.hasAcceptedTerms(lucas)).toBe(true);

    await server.restoreRemindersConsent(lucas);
    expect((await server.getAcceptance(lucas))!.remindersWithdrawnAt).toBeNull();
    expect((await db().select().from(termsAcceptances).where(eq(termsAcceptances.personId, lucas))).length).toBe(1);
  });

  it("quem nunca aceitou não tem o que retirar", async () => {
    await expect(server.withdrawRemindersConsent(maria)).rejects.toMatchObject({ code: "terms_not_accepted" });
  });
});
