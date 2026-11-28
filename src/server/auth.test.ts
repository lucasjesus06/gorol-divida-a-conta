import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claims: undefined as Record<string, unknown> | undefined,
  profile: null as { personId: string; displayName: string } | null,
  terms: false,
  pix: false,
  admin: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/db/client", () => ({ bindRequestPerson: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: state.claims } }) } }),
}));
vi.mock("./access", () => ({ isSuperAdmin: async () => state.admin }));
vi.mock("./profiles", () => ({ loadProfile: async () => state.profile }));
vi.mock("./terms", () => ({ hasAcceptedTerms: async () => state.terms }));
vi.mock("./pix", () => ({ hasPixKey: async () => state.pix }));

const auth = await import("./auth");

const account = { sub: "u1", email: "ana@exemplo.com" };

beforeEach(() => {
  state.claims = account;
  state.profile = { personId: "p1", displayName: "Ana" };
  state.terms = true;
  state.pix = true;
  state.admin = false;
});

describe("isOnboarded", () => {
  it("conta com perfil, termos e chave Pix está pronta", async () => {
    expect(await auth.isOnboarded()).toBe(true);
  });

  it("sem aceitar os termos, sem chave Pix ou sem perfil não está pronta: nada de menu", async () => {
    state.terms = false;
    expect(await auth.isOnboarded()).toBe(false);
    state.terms = true;
    state.pix = false;
    expect(await auth.isOnboarded()).toBe(false);
    state.pix = true;
    state.profile = null;
    expect(await auth.isOnboarded()).toBe(false);
  });

  it("sem sessão não está pronta", async () => {
    state.claims = undefined;
    expect(await auth.isOnboarded()).toBe(false);
  });
});

describe("requireReadyAccount", () => {
  it("devolve a conta quando está tudo feito", async () => {
    expect(await auth.requireReadyAccount()).toMatchObject({ profile: { personId: "p1" } });
  });

  it("manda terminar a etapa que falta, na ordem: perfil, termos, chave Pix", async () => {
    state.profile = null;
    await expect(auth.requireReadyAccount()).rejects.toThrow("REDIRECT:/perfil");
    state.profile = { personId: "p1", displayName: "Ana" };
    state.terms = false;
    await expect(auth.requireReadyAccount()).rejects.toThrow("REDIRECT:/termos");
    state.terms = true;
    state.pix = false;
    await expect(auth.requireReadyAccount()).rejects.toThrow("REDIRECT:/configuracoes/pix");
  });
});

describe("requireSuperAdmin", () => {
  it("não deixa o super admin entrar nas telas dele sem aceitar os termos", async () => {
    state.admin = true;
    state.terms = false;
    await expect(auth.requireSuperAdmin()).rejects.toThrow("REDIRECT:/termos");
  });

  it("quem não é super admin não encontra a tela, e o super admin pronto entra", async () => {
    await expect(auth.requireSuperAdmin()).rejects.toThrow("NOT_FOUND");
    state.admin = true;
    expect(await auth.requireSuperAdmin()).toEqual({ userId: "u1", personId: "p1" });
  });
});
