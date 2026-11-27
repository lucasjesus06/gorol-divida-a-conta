import { describe, expect, it } from "vitest";
import { buildPixPayload, formatPixKey, normalizePixKey, pixCrc16 } from "./pix";

describe("normalizePixKey", () => {
  it("aceita CPF com ou sem máscara e guarda só os dígitos", () => {
    expect(normalizePixKey("cpf", "529.982.247-25")).toEqual({ type: "cpf", value: "52998224725" });
  });

  it("recusa CPF com dígito errado ou repetido", () => {
    expect(() => normalizePixKey("cpf", "529.982.247-24")).toThrow("CPF");
    expect(() => normalizePixKey("cpf", "111.111.111-11")).toThrow("CPF");
  });

  it("valida CNPJ", () => {
    expect(normalizePixKey("cnpj", "11.222.333/0001-81").value).toBe("11222333000181");
    expect(() => normalizePixKey("cnpj", "11.222.333/0001-82")).toThrow("CNPJ");
  });

  it("converte o celular para o formato internacional", () => {
    expect(normalizePixKey("phone", "(11) 91234-5678").value).toBe("+5511912345678");
    expect(() => normalizePixKey("phone", "123")).toThrow("celular");
  });

  it("normaliza o e-mail e valida a chave aleatória", () => {
    expect(normalizePixKey("email", " Maria@Exemplo.COM ").value).toBe("maria@exemplo.com");
    expect(() => normalizePixKey("email", "maria")).toThrow("e-mail");
    const random = "123e4567-e89b-12d3-a456-426614174000";
    expect(normalizePixKey("random", random.toUpperCase()).value).toBe(random);
    expect(() => normalizePixKey("random", "abc")).toThrow("chave aleatória");
  });
});

describe("formatPixKey", () => {
  it("mostra CPF e CNPJ com máscara", () => {
    expect(formatPixKey({ type: "cpf", value: "52998224725" })).toBe("529.982.247-25");
    expect(formatPixKey({ type: "cnpj", value: "11222333000181" })).toBe("11.222.333/0001-81");
  });
});

describe("buildPixPayload", () => {
  it("calcula o CRC16 conforme o vetor de referência", () => {
    expect(pixCrc16("123456789")).toBe("29B1");
  });

  it("monta o copia e cola com valor, nome sem acento e CRC válido", () => {
    const payload = buildPixPayload({
      key: { type: "email", value: "maria@exemplo.com" },
      amountCents: 12345,
      receiverName: "Maria Conceição",
    });
    expect(payload.startsWith("000201010212")).toBe(true);
    expect(payload).toContain("0014br.gov.bcb.pix0117maria@exemplo.com");
    expect(payload).toContain("5406123.45");
    expect(payload).toContain("5915MARIA CONCEICAO");
    const body = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(pixCrc16(body));
  });

  it("recusa valor zero", () => {
    expect(() =>
      buildPixPayload({ key: { type: "email", value: "a@b.co" }, amountCents: 0, receiverName: "A" }),
    ).toThrow();
  });
});
