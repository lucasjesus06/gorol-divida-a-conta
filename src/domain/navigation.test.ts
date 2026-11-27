import { describe, expect, it } from "vitest";
import { safeNextPath } from "./navigation";

describe("safeNextPath", () => {
  it("aceita caminhos do próprio app, com busca", () => {
    expect(safeNextPath("/rolês/123?aba=saldo")).toBe("/rolês/123?aba=saldo");
  });

  it.each([undefined, null, "", "rolês", "//outro.com", "https://outro.com", "/\\outro.com", 42])(
    "volta para a página inicial com %j",
    (value) => {
      expect(safeNextPath(value)).toBe("/");
    },
  );
});
