import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getIdentity: vi.fn() }));
const join = vi.hoisted(() => ({ requestJoin: vi.fn() }));
const supabase = vi.hoisted(() => ({ auth: { signInAnonymously: vi.fn() } }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/join", () => join);
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => supabase }));
vi.mock("next/navigation", () => navigation);

const { joinAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const dados = { token: "tok", participantId: "p1", phone: "11988880002" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.getIdentity.mockResolvedValue(null);
  supabase.auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "guest-1" } }, error: null });
  join.requestJoin.mockResolvedValue(undefined);
});

describe("joinAction", () => {
  it("sem sessão, cria a de convidado, pede para entrar e vai para a espera", async () => {
    await expect(joinAction({}, form(dados))).rejects.toThrow("REDIRECT:/aguardando");
    expect(join.requestJoin).toHaveBeenCalledWith("tok", "guest-1", { participantId: "p1", phone: "11988880002" });
  });

  it("convidado que já tem sessão não cria outra", async () => {
    auth.getIdentity.mockResolvedValue({ kind: "guest", userId: "guest-9" });
    await expect(joinAction({}, form(dados))).rejects.toThrow("REDIRECT:/aguardando");
    expect(supabase.auth.signInAnonymously).not.toHaveBeenCalled();
    expect(join.requestJoin).toHaveBeenCalledWith("tok", "guest-9", expect.anything());
  });

  it("quem está logado com conta é avisado e nada é pedido", async () => {
    auth.getIdentity.mockResolvedValue({ kind: "account", userId: "u1", email: "a@b.c" });
    expect((await joinAction({}, form(dados))).error).toContain("saia primeiro");
    expect(join.requestJoin).not.toHaveBeenCalled();
  });

  it("mostra o aviso da regra de negócio, como telefone que não confere", async () => {
    join.requestJoin.mockRejectedValue(new DomainError("phone_mismatch", "O telefone não confere."));
    expect(await joinAction({}, form(dados))).toEqual({ error: "O telefone não confere." });
  });

  it("não esconde erro inesperado", async () => {
    supabase.auth.signInAnonymously.mockResolvedValue({ data: { user: null }, error: { message: "desligado" } });
    await expect(joinAction({}, form(dados))).rejects.toThrow("desligado");
  });
});
