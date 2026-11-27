import { describe, expect, it } from "vitest";
import { isActivePath } from "./nav";

describe("isActivePath", () => {
  it("o início só fica ativo na raiz", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/roles", "/")).toBe(false);
  });

  it("uma área fica ativa nela e nas telas de dentro", () => {
    expect(isActivePath("/roles", "/roles")).toBe(true);
    expect(isActivePath("/roles/novo", "/roles")).toBe(true);
    expect(isActivePath("/roles/abc", "/roles")).toBe(true);
  });

  it("não confunde áreas com o mesmo começo", () => {
    expect(isActivePath("/rolesx", "/roles")).toBe(false);
    expect(isActivePath("/admin", "/roles")).toBe(false);
  });
});
