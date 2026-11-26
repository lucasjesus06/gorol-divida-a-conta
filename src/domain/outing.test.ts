import { describe, expect, it } from "vitest";
import { normalizeOutingName } from "./outing";

describe("normalizeOutingName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeOutingName("  Churrasco   de sábado ")).toBe("Churrasco de sábado");
  });

  it("rejects an empty name", () => {
    expect(() => normalizeOutingName(" ")).toThrowError(
      expect.objectContaining({ code: "outing_name_required" }),
    );
  });

  it("rejects a name longer than 120 characters", () => {
    expect(() => normalizeOutingName("a".repeat(121))).toThrowError(
      expect.objectContaining({ code: "outing_name_too_long" }),
    );
  });
});
