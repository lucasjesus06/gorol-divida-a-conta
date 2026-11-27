import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  auth: { signInWithOtp: vi.fn(), verifyOtp: vi.fn(), signOut: vi.fn() },
}));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => supabase }));
vi.mock("next/navigation", () => navigation);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { sendCode, signOut, verifyCode } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.signInWithOtp.mockResolvedValue({ error: null });
  supabase.auth.verifyOtp.mockResolvedValue({ error: null });
  supabase.auth.signOut.mockResolvedValue({ error: null });
});

describe("sendCode", () => {
  it("recusa e-mail inválido sem chamar o Supabase", async () => {
    expect(await sendCode({}, form({ email: "ana" }))).toEqual({ error: "Informe um e-mail válido." });
    expect(supabase.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("pede o código sem criar conta nova", async () => {
    expect(await sendCode({}, form({ email: " Ana@Exemplo.com " }))).toEqual({ email: "ana@exemplo.com" });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "ana@exemplo.com",
      options: { shouldCreateUser: false },
    });
  });

  it("responde igual quando o e-mail não tem acesso, para não revelar quem tem conta", async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({ error: { status: 422, message: "Signups not allowed" } });
    expect(await sendCode({}, form({ email: "intruso@exemplo.com" }))).toEqual({ email: "intruso@exemplo.com" });
  });

  it("avisa quando há tentativas demais", async () => {
    supabase.auth.signInWithOtp.mockResolvedValue({ error: { status: 429, message: "rate limit" } });
    expect(await sendCode({}, form({ email: "ana@exemplo.com" }))).toEqual({
      error: "Muitas tentativas. Aguarde um pouco e tente de novo.",
    });
  });
});

describe("verifyCode", () => {
  it("recusa código fora do formato sem chamar o Supabase", async () => {
    expect(await verifyCode({}, form({ email: "ana@exemplo.com", code: "abc" }))).toEqual({
      error: "Informe o código que chegou no e-mail.",
    });
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it("não revela se o código errou ou venceu", async () => {
    supabase.auth.verifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });
    expect(await verifyCode({}, form({ email: "ana@exemplo.com", code: "123456" }))).toEqual({
      error: "Código inválido ou vencido.",
    });
  });

  it("entra e volta para a página pedida", async () => {
    await expect(
      verifyCode({}, form({ email: "ana@exemplo.com", code: "123 456", next: "/rolês/1" })),
    ).rejects.toThrow("REDIRECT:/rolês/1");
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ email: "ana@exemplo.com", token: "123456", type: "email" });
  });

  it("não deixa o destino levar para outro site", async () => {
    await expect(
      verifyCode({}, form({ email: "ana@exemplo.com", code: "123456", next: "//outro.com" })),
    ).rejects.toThrow("REDIRECT:/");
  });
});

describe("signOut", () => {
  it("encerra a sessão e volta para o login", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/login");
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
