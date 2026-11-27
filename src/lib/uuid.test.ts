import { describe, expect, it } from "vitest";
import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("aceita um UUID", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
  });

  it.each(["", "novo", "1234", "11111111-1111-4111-8111-11111111111g"])("recusa %j", (value) => {
    expect(isUuid(value)).toBe(false);
  });
});
