import { describe, expect, it } from "vitest";
import { normalizeCode } from "./otp";

describe("normalizeCode", () => {
  it("mantém só os dígitos", () => {
    expect(normalizeCode("12a3-4 5")).toBe("12345");
  });

  it("cola o código inteiro, mesmo com espaços no meio", () => {
    expect(normalizeCode("123 456")).toBe("123456");
    expect(normalizeCode(" 123456\n")).toBe("123456");
  });

  it("corta o que passa do tamanho do código", () => {
    expect(normalizeCode("12345678")).toBe("123456");
    expect(normalizeCode("12345678", 8)).toBe("12345678");
  });

  it("vazio continua vazio", () => {
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode("abc")).toBe("");
  });
});
