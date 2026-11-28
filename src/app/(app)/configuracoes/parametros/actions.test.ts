import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ requireSuperAdmin: vi.fn() }));
const params = vi.hoisted(() => ({ saveParameter: vi.fn(), resetParameter: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/system-parameters", () => params);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireSuperAdmin.mockResolvedValue({ userId: "u1", personId: "admin1" });
});

describe("parâmetros", () => {
  it("salva o número digitado em nome do super admin, aceitando vírgula", async () => {
    expect(await actions.saveParameterAction({ key: "closing.vote_days", value: " 5 " })).toEqual({ saved: true });
    expect(params.saveParameter).toHaveBeenCalledWith("admin1", "closing.vote_days", 5);
    await actions.saveParameterAction({ key: "closing.vote_days", value: "2,5" });
    expect(params.saveParameter).toHaveBeenLastCalledWith("admin1", "closing.vote_days", 2.5);
  });

  it("campo vazio vira número inválido e a regra recusa", async () => {
    params.saveParameter.mockRejectedValue(new DomainError("parameter_not_integer", "Informe um número inteiro."));
    expect(await actions.saveParameterAction({ key: "closing.vote_days", value: "" })).toEqual({ error: "Informe um número inteiro." });
    expect(Number.isNaN(params.saveParameter.mock.calls[0][2])).toBe(true);
  });

  it("devolve a mensagem de valor fora dos limites", async () => {
    params.saveParameter.mockRejectedValue(new DomainError("parameter_out_of_range", "O valor precisa ficar entre 1 e 14 dias."));
    expect(await actions.saveParameterAction({ key: "closing.vote_days", value: "99" })).toEqual({ error: "O valor precisa ficar entre 1 e 14 dias." });
  });

  it("volta ao padrão em nome do super admin", async () => {
    expect(await actions.resetParameterAction("closing.vote_days")).toEqual({ saved: true });
    expect(params.resetParameter).toHaveBeenCalledWith("admin1", "closing.vote_days");
  });
});
