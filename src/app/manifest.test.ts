import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("manifesto do aplicativo", () => {
  const result = manifest();

  it("tem o que os navegadores exigem para instalar", () => {
    expect(result).toMatchObject({ name: expect.any(String), short_name: "GoRolê", start_url: "/", display: "standalone" });
    const sizes = result.icons?.map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(result.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("aponta para ícones que existem na pasta pública", () => {
    for (const icon of result.icons ?? []) {
      expect(existsSync(path.join(process.cwd(), "public", icon.src)), icon.src).toBe(true);
    }
  });

  it("usa a mesma cor de fundo do tema", () => {
    expect(result.background_color).toBe("#0d0d12");
    expect(result.theme_color).toBe("#0d0d12");
  });
});
