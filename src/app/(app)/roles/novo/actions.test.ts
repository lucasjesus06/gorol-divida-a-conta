import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const outings = vi.hoisted(() => ({ createOuting: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/outings", () => outings);
vi.mock("next/navigation", () => navigation);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { createOutingAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const profile = { personId: "p1", displayName: "Lucas" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue(profile);
  outings.createOuting.mockResolvedValue("o1");
});

describe("createOutingAction", () => {
  it("cria o rolê em nome de quem está logado e abre a página dele", async () => {
    await expect(createOutingAction({}, form({ name: "Churrasco", kind: "event" }))).rejects.toThrow("REDIRECT:/roles/o1");
    expect(outings.createOuting).toHaveBeenCalledWith(profile, { name: "Churrasco", kind: "event" });
  });

  it("mostra o aviso da regra de negócio, sem sair da tela", async () => {
    outings.createOuting.mockRejectedValue(new DomainError("account_not_approved", "Só quem tem conta aprovada cria rolês."));
    expect(await createOutingAction({}, form({ name: "Churrasco", kind: "event" }))).toEqual({
      error: "Só quem tem conta aprovada cria rolês.",
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("não esconde erro inesperado", async () => {
    outings.createOuting.mockRejectedValue(new Error("banco fora"));
    await expect(createOutingAction({}, form({ name: "Churrasco", kind: "event" }))).rejects.toThrow("banco fora");
  });
});
