import { describe, expect, it } from "vitest";
import { DEFAULT_TEMPLATES, MAX_TEMPLATE_LENGTH, pickTemplate, renderTemplate, validateTemplate, validateTemplates, whatsappLink } from "./reminder-message";

const values = { debtorName: "Maria Souza", creditorName: "Lucas Jesus", amountCents: 12345, outingNames: ["Churrasco", "Praia"], pixKey: "lucas@exemplo.com" };

describe("validateTemplate", () => {
  it("aceita variáveis conhecidas e limpa as bordas", () => {
    expect(validateTemplate("  Oi {nome}, {valor}  ")).toBe("Oi {nome}, {valor}");
  });

  it("recusa vazio, texto longo demais e variável desconhecida", () => {
    expect(() => validateTemplate("   ")).toThrow("vazio");
    expect(() => validateTemplate("x".repeat(MAX_TEMPLATE_LENGTH + 1))).toThrow("máximo");
    expect(() => validateTemplate("Oi {apelido}")).toThrow("{apelido}");
  });

  it("recusa lista vazia e lista grande demais", () => {
    expect(() => validateTemplates([])).toThrow();
    expect(() => validateTemplates(Array.from({ length: 11 }, () => "oi"))).toThrow();
  });

  it("os textos padrão são todos válidos", () => {
    expect(() => validateTemplates([...DEFAULT_TEMPLATES])).not.toThrow();
  });
});

describe("renderTemplate", () => {
  it("troca as variáveis usando só o primeiro nome e o valor formatado", () => {
    const text = renderTemplate("{nome} deve {valor} a {credor} ({rolês}). {chave_pix}", values);
    expect(text).toContain("Maria deve");
    expect(text).toContain("123,45");
    expect(text).toContain("a Lucas (Churrasco, Praia). lucas@exemplo.com");
  });

  it("avisa quando o credor não tem chave", () => {
    expect(renderTemplate("{chave_pix}", { ...values, pixKey: null })).toContain("sem chave");
  });
});

describe("pickTemplate", () => {
  it("gira entre os textos pela ordem da cobrança", () => {
    expect(pickTemplate(["a", "b"], 1)).toBe("a");
    expect(pickTemplate(["a", "b"], 2)).toBe("b");
    expect(pickTemplate(["a", "b"], 3)).toBe("a");
  });

  it("usa os padrões quando não há texto próprio", () => {
    expect(pickTemplate([], 1)).toBe(DEFAULT_TEMPLATES[0]);
  });
});

describe("whatsappLink", () => {
  it("abre a conversa só com dígitos e a mensagem codificada", () => {
    expect(whatsappLink("+55 (11) 99999-0001", "Oi, tudo bem? 100%")).toBe("https://wa.me/5511999990001?text=Oi%2C%20tudo%20bem%3F%20100%25");
  });
});
