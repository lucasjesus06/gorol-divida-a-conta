import { describe, expect, it } from "vitest";
import { NO_OVERRIDES, effectiveOutingSettings, suggestedServiceCharge, validateOutingSettings } from "./outing-settings";
import { resolveParameters } from "./system-parameters";

const system = resolveParameters({});

describe("validateOutingSettings", () => {
  it("aceita tudo vazio (usar os padrões) e valores dentro dos limites do sistema", () => {
    expect(validateOutingSettings(NO_OVERRIDES)).toEqual(NO_OVERRIDES);
    expect(validateOutingSettings({ voteDays: 5, disputeWindowDays: 30, defaultSplit: "exact", suggestedRoute: "manual", serviceFeePercent: 13 })).toMatchObject({ voteDays: 5, serviceFeePercent: 13 });
  });

  it("recusa o que passa dos limites que o super admin definiu", () => {
    expect(() => validateOutingSettings({ ...NO_OVERRIDES, voteDays: 15 })).toThrow("entre 1 e 14 dias");
    expect(() => validateOutingSettings({ ...NO_OVERRIDES, disputeWindowDays: 0 })).toThrow("entre 1 e 60 dias");
    expect(() => validateOutingSettings({ ...NO_OVERRIDES, voteDays: 2.5 })).toThrow("inteiro");
  });

  it("recusa opção que não existe", () => {
    expect(() => validateOutingSettings({ ...NO_OVERRIDES, serviceFeePercent: 12 as 10 })).toThrow("10% ou 13%");
    expect(() => validateOutingSettings({ ...NO_OVERRIDES, defaultSplit: "itemized" as "equal" })).toThrow("por igual");
    expect(() => validateOutingSettings({ ...NO_OVERRIDES, suggestedRoute: "rapida" as "smart" })).toThrow("rota");
  });
});

describe("effectiveOutingSettings", () => {
  it("sem escolha do dono vale o padrão do sistema e os padrões fixos", () => {
    expect(effectiveOutingSettings(NO_OVERRIDES, system)).toEqual({ voteDays: 3, disputeWindowDays: 7, defaultSplit: "equal", suggestedRoute: "smart", serviceFeePercent: 0 });
  });

  it("o padrão do sistema alterado vale para quem não escolheu, e a escolha do dono vence", () => {
    const changed = resolveParameters({ "closing.vote_days": 5, "dispute.window_days": 14 });
    expect(effectiveOutingSettings(NO_OVERRIDES, changed)).toMatchObject({ voteDays: 5, disputeWindowDays: 14 });
    expect(effectiveOutingSettings({ ...NO_OVERRIDES, voteDays: 2 }, changed).voteDays).toBe(2);
  });
});

describe("suggestedServiceCharge", () => {
  it("é a porcentagem sobre os itens, arredondada ao centavo", () => {
    expect(suggestedServiceCharge([5000, 3000], 10)).toBe(800);
    expect(suggestedServiceCharge([3333], 13)).toBe(433);
    expect(suggestedServiceCharge([], 10)).toBe(0);
    expect(suggestedServiceCharge([5000], 0)).toBe(0);
  });
});
