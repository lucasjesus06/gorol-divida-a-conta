import { describe, expect, it } from "vitest";
import { computeOutingBalances } from "./outing-balance";
import { pairStatement } from "./pair-statement";
import { anExpense } from "@/test/expense-fixtures";
import { aDeclaredPayment } from "@/test/payment-fixtures";
import { attachProof, confirmPayment, contestPayment, rejectPayment } from "./payment";

const AT = new Date("2026-11-10T13:00:00Z");
const daysLater = (days: number) => new Date(AT.getTime() + days * 24 * 3600_000);
const proof = { fileId: "file-1", source: "share" as const, uploadedAt: AT };

describe("payments between participants", () => {
  it("starts as declared and is confirmed by the creditor", () => {
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    expect(declared.status).toBe("declared");
    const confirmed = confirmPayment(declared, "aghata", AT);
    expect(confirmed).toMatchObject({
      status: "confirmed",
      confirmedBy: "creditor",
      resolvedAt: AT,
    });
  });

  it("only lets the creditor confirm or reject", () => {
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    expect(() => confirmPayment(declared, "gustavo", AT)).toThrow("Só quem recebeu");
  });

  it("cannot be resolved twice", () => {
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    const rejected = rejectPayment(declared, "aghata", AT);
    expect(() => confirmPayment(rejected, "aghata", AT)).toThrow("já foi");
  });

  it("rejects paying oneself and invalid 'on behalf of'", () => {
    expect(() => aDeclaredPayment({ fromId: "a", toId: "a", amountCents: 100 })).toThrow(
      "pessoas diferentes",
    );
    expect(() =>
      aDeclaredPayment({ fromId: "a", toId: "b", amountCents: 100, onBehalfOfId: "b" }),
    ).toThrow("terceira pessoa");
  });
});

describe("bank receipt", () => {
  it("confirms the payment right away when the receipt comes with it", () => {
    const payment = aDeclaredPayment({
      fromId: "gustavo",
      toId: "aghata",
      amountCents: 4000,
      proof,
    });
    expect(payment).toMatchObject({
      status: "confirmed",
      confirmedBy: "receipt",
      contestableUntil: daysLater(3),
    });
  });

  it("can be sent later, only by whoever paid", () => {
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    expect(() => attachProof(declared, "aghata", proof)).toThrow("Só quem pagou");
    expect(attachProof(declared, "gustavo", proof).status).toBe("confirmed");
  });

  it("lets the creditor contest within 3 days, taking it out of the balance", () => {
    const expense = anExpense({
      payers: [{ participantId: "aghata", amountCents: 8000 }],
      split: { method: "equal", participantIds: ["aghata", "gustavo"] },
    });
    const confirmed = aDeclaredPayment({
      fromId: "gustavo",
      toId: "aghata",
      amountCents: 4000,
      proof,
    });
    expect(computeOutingBalances("outing-1", [expense], [confirmed]).get("gustavo")?.netCents).toBe(
      0,
    );

    const contested = contestPayment(confirmed, "aghata", daysLater(2), "Não caiu na conta");
    expect(contested).toMatchObject({ status: "contested", contestReason: "Não caiu na conta" });
    expect(computeOutingBalances("outing-1", [expense], [contested]).get("gustavo")?.netCents).toBe(
      -4000,
    );
    expect(pairStatement("aghata", "gustavo", [expense], [contested]).netCents).toBe(4000);

    expect(confirmPayment(contested, "aghata", daysLater(4)).confirmedBy).toBe("creditor");
  });

  it("cannot be contested after the deadline", () => {
    const confirmed = aDeclaredPayment({
      fromId: "gustavo",
      toId: "aghata",
      amountCents: 4000,
      proof,
    });
    expect(() => contestPayment(confirmed, "aghata", daysLater(4), "Tarde demais")).toThrow(
      "prazo",
    );
  });

  it("does not let anyone contest a payment the creditor confirmed", () => {
    const declared = aDeclaredPayment({ fromId: "gustavo", toId: "aghata", amountCents: 4000 });
    const confirmed = confirmPayment(declared, "aghata", AT);
    expect(() => contestPayment(confirmed, "aghata", AT, "Mudei de ideia")).toThrow(
      "confirmados por comprovante",
    );
  });
});
