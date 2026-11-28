import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const settings = vi.hoisted(() => ({ saveOutingSettings: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/outing-settings", () => settings);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveOutingSettingsAction } = await import("./settings-actions");

const outingId = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
});

describe("saveOutingSettingsAction", () => {
  it("repassa o que o dono escolheu, e o que ficou vazio vai como padrão", async () => {
    expect(await saveOutingSettingsAction({}, form({ outingId, voteDays: "5", disputeWindowDays: "", defaultSplit: "exact", suggestedRoute: "", serviceFeePercent: "10" }))).toEqual({ saved: true });
    expect(settings.saveOutingSettings).toHaveBeenCalledWith("p1", outingId, {
      voteDays: 5,
      disputeWindowDays: null,
      defaultSplit: "exact",
      suggestedRoute: null,
      serviceFeePercent: 10,
    });
  });

  it("opção inventada vira padrão em vez de chegar ao servidor", async () => {
    await saveOutingSettingsAction({}, form({ outingId, defaultSplit: "golpe", suggestedRoute: "rapida", serviceFeePercent: "12" }));
    expect(settings.saveOutingSettings).toHaveBeenCalledWith("p1", outingId, expect.objectContaining({ defaultSplit: null, suggestedRoute: null, serviceFeePercent: null }));
  });

  it("devolve a mensagem da regra e recusa rolê inválido", async () => {
    settings.saveOutingSettings.mockRejectedValue(new DomainError("parameter_out_of_range", "Prazo: o valor precisa ficar entre 1 e 14 dias."));
    expect(await saveOutingSettingsAction({}, form({ outingId, voteDays: "30" }))).toEqual({ error: "Prazo: o valor precisa ficar entre 1 e 14 dias." });
    expect(await saveOutingSettingsAction({}, form({ outingId: "x" }))).toEqual({ error: "Rolê não encontrado." });
  });
});
