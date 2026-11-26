import { describe, expect, it } from "vitest";
import { DomainError } from "./domain-error";
import { normalizeDisplayName } from "./person";

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
