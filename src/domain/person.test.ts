import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error";
import { NICKNAME_MAX_LENGTH, greetingName, normalizeDisplayName, normalizeNickname } from "./person";

describe("normalizeDisplayName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeDisplayName("  Maria   Clara ")).toBe("Maria Clara");
  });

  it("keeps emoji and accents", () => {
    expect(normalizeDisplayName("João 🍺")).toBe("João 🍺");
  });

  it("rejects an empty name", () => {
    expect(() => normalizeDisplayName("   ")).toThrow(
      new DomainError("display_name_required", "Informe o seu nome."),
    );
  });

  it("rejects a name longer than 80 characters", () => {
    expect(() => normalizeDisplayName("a".repeat(81))).toThrowError(
      expect.objectContaining({ code: "display_name_too_long" }),
    );
  });
});

describe("normalizeNickname", () => {
  it("limpa os espaços e devolve vazio como nulo, para voltar ao primeiro nome", () => {
    expect(normalizeNickname("  Mari   Souza ")).toBe("Mari Souza");
    expect(normalizeNickname("   ")).toBeNull();
    expect(normalizeNickname("")).toBeNull();
  });

  it("recusa apelido grande demais", () => {
    expect(() => normalizeNickname("x".repeat(NICKNAME_MAX_LENGTH + 1))).toThrow(DomainError);
    expect(normalizeNickname("x".repeat(NICKNAME_MAX_LENGTH))).toHaveLength(NICKNAME_MAX_LENGTH);
  });
});

describe("greetingName", () => {
  it("usa o apelido quando existe e, senão, o primeiro nome", () => {
    expect(greetingName("Maria Souza", "Mari")).toBe("Mari");
    expect(greetingName("Maria Souza", null)).toBe("Maria");
    expect(greetingName("  Lucas  ", null)).toBe("Lucas");
  });
});
