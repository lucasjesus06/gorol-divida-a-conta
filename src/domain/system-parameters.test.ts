import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_POLICY } from "./charge-reminder";
import { parameterCatalog, parameterDefinition, reminderPolicyFrom, resolveParameters, validateParameterValue } from "./system-parameters";

describe("catálogo", () => {
  it("todo padrão está dentro dos próprios limites, e as chaves não se repetem", () => {
    for (const definition of parameterCatalog) {
      expect(definition.default, definition.key).toBeGreaterThanOrEqual(definition.min);
      expect(definition.default, definition.key).toBeLessThanOrEqual(definition.max);
    }
    expect(new Set(parameterCatalog.map((definition) => definition.key)).size).toBe(parameterCatalog.length);
  });

  it("o começo do horário de envio nunca alcança o fim, em nenhum valor permitido", () => {
    const start = parameterDefinition("reminder.window_start_hour");
    const end = parameterDefinition("reminder.window_end_hour");
    expect(start.max).toBeLessThan(end.min);
  });

  it("parâmetro desconhecido é recusado", () => {
    expect(() => parameterDefinition("nada.disso")).toThrow("desconhecido");
  });
});

describe("validateParameterValue", () => {
  it("aceita os limites e recusa fora deles, com a mensagem dos limites", () => {
    expect(validateParameterValue("closing.vote_days", 1)).toBe(1);
    expect(validateParameterValue("closing.vote_days", 14)).toBe(14);
    expect(() => validateParameterValue("closing.vote_days", 0)).toThrow("entre 1 e 14 dias");
    expect(() => validateParameterValue("closing.vote_days", 15)).toThrow("entre 1 e 14 dias");
  });

  it("só aceita número inteiro", () => {
    expect(() => validateParameterValue("closing.vote_days", 2.5)).toThrow("inteiro");
    expect(() => validateParameterValue("closing.vote_days", Number.NaN)).toThrow("inteiro");
  });

  it("zero pausas é permitido e desliga as pausas", () => {
    expect(validateParameterValue("reminder.max_pauses", 0)).toBe(0);
  });
});

describe("resolveParameters", () => {
  it("sem nada alterado vale o padrão de todos", () => {
    const values = resolveParameters({});
    expect(Object.keys(values)).toHaveLength(parameterCatalog.length);
    expect(values["dispute.window_days"]).toBe(7);
  });

  it("o valor alterado substitui o padrão, e um valor inválido guardado é ignorado", () => {
    const values = resolveParameters({ "closing.vote_days": 5, "dispute.window_days": 9999 });
    expect(values["closing.vote_days"]).toBe(5);
    expect(values["dispute.window_days"]).toBe(7);
  });
});

describe("reminderPolicyFrom", () => {
  it("com os padrões devolve exatamente a política de cobrança de antes", () => {
    expect(reminderPolicyFrom(resolveParameters({}))).toEqual(DEFAULT_REMINDER_POLICY);
  });

  it("usa os valores alterados", () => {
    const policy = reminderPolicyFrom(resolveParameters({ "reminder.min_interval_hours": 48, "reminder.window_end_hour": 18 }));
    expect(policy.minIntervalHours).toBe(48);
    expect(policy.sendWindow).toEqual({ startHour: 10, endHour: 18 });
  });
});
