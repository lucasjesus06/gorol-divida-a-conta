import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ requireAccount: vi.fn() }));
const profiles = vi.hoisted(() => ({ loadProfile: vi.fn() }));
const terms = vi.hoisted(() => ({ acceptTerms: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/profiles", () => profiles);
vi.mock("@/server/terms", () => terms);
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const { acceptTermsAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAccount.mockResolvedValue({ kind: "account", userId: "u1", email: "a@b.co" });
  profiles.loadProfile.mockResolvedValue({ personId: "p1", displayName: "Maria" });
});

describe("acceptTermsAction", () => {
  it("registra o aceite dos termos e dos lembretes e segue para o início", async () => {
    await expect(acceptTermsAction({}, form({ terms: "on", reminders: "on" }))).rejects.toThrow("REDIRECT:/");
    expect(terms.acceptTerms).toHaveBeenCalledWith("p1", { acceptedTerms: true, acceptedReminders: true });
  });

  it("devolve a mensagem da regra quando falta um dos aceites", async () => {
    terms.acceptTerms.mockRejectedValue(new DomainError("reminders_consent_required", "Para usar o GoRolê, aceite receber lembretes de pagamento."));
    expect(await acceptTermsAction({}, form({ terms: "on" }))).toEqual({ error: "Para usar o GoRolê, aceite receber lembretes de pagamento." });
    expect(terms.acceptTerms).toHaveBeenCalledWith("p1", { acceptedTerms: true, acceptedReminders: false });
  });

  it("manda para o cadastro quem ainda não tem perfil", async () => {
    profiles.loadProfile.mockResolvedValue(null);
    await expect(acceptTermsAction({}, form({ terms: "on", reminders: "on" }))).rejects.toThrow("REDIRECT:/perfil");
  });
});
