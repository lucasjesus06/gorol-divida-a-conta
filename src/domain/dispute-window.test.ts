import { describe, expect, it } from "vitest";
import { DISPUTE_WINDOW_DAYS, LATE_DISPUTE_WARNING, assertLateDisputeConfirmed, disputeWindow } from "./dispute-window";

const closedAt = new Date("2026-03-01T12:00:00Z");
const daysAfter = (days: number, extraMs = 0) => new Date(closedAt.getTime() + days * 86_400_000 + extraMs);

describe("disputeWindow", () => {
  it("rolê aberto é o caso normal", () => {
    expect(disputeWindow(null, closedAt)).toBe("active");
  });

  it("até 7 dias depois de encerrado ainda está no prazo, inclusive no último instante", () => {
    expect(DISPUTE_WINDOW_DAYS).toBe(7);
    expect(disputeWindow(closedAt, daysAfter(0))).toBe("within");
    expect(disputeWindow(closedAt, daysAfter(7))).toBe("within");
  });

  it("depois de 7 dias é fora do prazo", () => {
    expect(disputeWindow(closedAt, daysAfter(7, 1))).toBe("late");
    expect(disputeWindow(closedAt, daysAfter(30))).toBe("late");
  });
});

describe("assertLateDisputeConfirmed", () => {
  it("fora do prazo só segue com a confirmação, e a mensagem explica o efeito", () => {
    expect(() => assertLateDisputeConfirmed("late", false)).toThrow(LATE_DISPUTE_WARNING);
    expect(() => assertLateDisputeConfirmed("late", true)).not.toThrow();
  });

  it("no prazo ou com o rolê aberto não pede confirmação", () => {
    expect(() => assertLateDisputeConfirmed("within", false)).not.toThrow();
    expect(() => assertLateDisputeConfirmed("active", false)).not.toThrow();
  });
});
