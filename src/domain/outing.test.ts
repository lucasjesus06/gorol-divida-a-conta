import { describe, expect, it } from "vitest";
import { normalizeOutingName, parseOutingKind } from "./outing";

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

describe("parseOutingKind", () => {
  it.each(["event", "recurring"])("aceita %s", (kind) => {
    expect(parseOutingKind(kind)).toBe(kind);
  });

  it.each(["party", "", null, undefined, 1])("recusa %j", (kind) => {
    expect(() => parseOutingKind(kind)).toThrowError(expect.objectContaining({ code: "invalid_outing_kind" }));
  });
});
