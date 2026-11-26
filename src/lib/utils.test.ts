import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("junta classes e resolve conflitos do Tailwind", () => {
    expect(cn("px-2", "px-4", false && "hidden")).toBe("px-4");
  });
});
