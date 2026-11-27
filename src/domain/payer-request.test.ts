import { describe, expect, it } from "vitest";
import { assertRequesterPays } from "./payer-request";

describe("assertRequesterPays", () => {
  const payers = [
    { participantId: "ana", amountCents: 600 },
    { participantId: "bia", amountCents: 400 },
  ];

  it("aceita quando quem pede aparece entre os pagantes", () => {
    expect(() => assertRequesterPays(payers, "bia")).not.toThrow();
  });

  it("recusa quando quem pede não pagou nada", () => {
    expect(() => assertRequesterPays(payers, "caio")).toThrowError(expect.objectContaining({ code: "requester_must_pay" }));
  });
});
