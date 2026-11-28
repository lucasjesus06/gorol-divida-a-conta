import { describe, expect, it } from "vitest";
import { TERMS_VERSION, assertCanAccept, hasAcceptedCurrentTerms, remindersConsentedAt } from "./terms";

const accepted = new Date("2026-11-28T12:00:00Z");
const acceptance = { version: TERMS_VERSION, acceptedAt: accepted, remindersConsent: true, remindersWithdrawnAt: null };

describe("aceite da versão vigente", () => {
  it("só vale o aceite da versão atual dos termos", () => {
    expect(hasAcceptedCurrentTerms(acceptance)).toBe(true);
    expect(hasAcceptedCurrentTerms({ ...acceptance, version: "2020-01-01" })).toBe(false);
    expect(hasAcceptedCurrentTerms(null)).toBe(false);
  });
});

describe("consentimento dos lembretes", () => {
  it("vale a data do aceite quando está tudo em ordem", () => {
    expect(remindersConsentedAt(acceptance)).toEqual(accepted);
  });

  it("não vale sem aceite, com versão antiga, sem consentimento ou depois de retirado", () => {
    expect(remindersConsentedAt(null)).toBeNull();
    expect(remindersConsentedAt({ ...acceptance, version: "2020-01-01" })).toBeNull();
    expect(remindersConsentedAt({ ...acceptance, remindersConsent: false })).toBeNull();
    expect(remindersConsentedAt({ ...acceptance, remindersWithdrawnAt: new Date() })).toBeNull();
  });
});

describe("assertCanAccept", () => {
  it("pede os dois aceites, com mensagens diferentes", () => {
    expect(() => assertCanAccept({ acceptedTerms: true, acceptedReminders: true })).not.toThrow();
    expect(() => assertCanAccept({ acceptedTerms: false, acceptedReminders: true })).toThrow("termos de uso");
    expect(() => assertCanAccept({ acceptedTerms: true, acceptedReminders: false })).toThrow("lembretes");
  });
});
