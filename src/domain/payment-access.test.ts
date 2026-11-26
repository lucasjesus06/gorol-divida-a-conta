import { describe, expect, it } from "vitest";
import { aDeclaredPayment } from "@/test/payment-fixtures";
import { assertPaymentPeopleInOuting } from "./payment-access";

describe("assertPaymentPeopleInOuting", () => {
  const participants = new Set(["ana", "bia", "caio"]);

  it("accepts payments between participants, also on someone's behalf", () => {
    const payment = aDeclaredPayment({
      fromId: "ana",
      toId: "bia",
      amountCents: 1000,
      onBehalfOfId: "caio",
    });
    expect(() => assertPaymentPeopleInOuting(payment, participants)).not.toThrow();
  });

  it.each([
    ["the receiver", { fromId: "ana", toId: "zé", amountCents: 1000 }],
    ["the person covered", { fromId: "ana", toId: "bia", amountCents: 1000, onBehalfOfId: "zé" }],
  ])("rejects %s outside the outing", (_case, input) => {
    expect(() => assertPaymentPeopleInOuting(aDeclaredPayment(input), participants)).toThrowError(
      expect.objectContaining({ code: "person_not_in_outing" }),
    );
  });
});
