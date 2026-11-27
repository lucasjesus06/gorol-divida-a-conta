import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (name: string) => state.values[name] ?? null }) }));

const { requestOrigin } = await import("./origin");

beforeEach(() => {
  state.values = {};
});

describe("requestOrigin", () => {
  it("usa o host e o protocolo repassados pelo proxy", async () => {
    state.values = { "x-forwarded-host": "gorole.app", "x-forwarded-proto": "https", host: "interno:3000" };
    expect(await requestOrigin()).toBe("https://gorole.app");
  });

  it("em localhost assume http", async () => {
    state.values = { host: "localhost:3001" };
    expect(await requestOrigin()).toBe("http://localhost:3001");
  });

  it("fora de localhost assume https", async () => {
    state.values = { host: "gorole.app" };
    expect(await requestOrigin()).toBe("https://gorole.app");
  });

  it("falha sem host", async () => {
    await expect(requestOrigin()).rejects.toThrow("host");
  });
});
