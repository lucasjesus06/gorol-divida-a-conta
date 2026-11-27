import { describe, expect, it } from "vitest";
import { Fraction } from "./fraction";
import {
  assertCanChangeExpense,
  assertCanRegisterExpense,
  assertPayersAllowed,
  assertPeopleInOuting,
  peopleInExpense,
} from "./expense-access";

describe("peopleInExpense", () => {
  const payers = [{ participantId: "ana", amountCents: 1000 }];

  it("collects payers and equal split participants", () => {
    expect(peopleInExpense(payers, { method: "equal", participantIds: ["ana", "bia"] })).toEqual(
      new Set(["ana", "bia"]),
    );
  });

  it("collects exact shares", () => {
    const split = {
      method: "exact" as const,
      shares: [
        { participantId: "bia", amountCents: 600 },
        { participantId: "caio", amountCents: 400 },
      ],
    };
    expect(peopleInExpense(payers, split)).toEqual(new Set(["ana", "bia", "caio"]));
  });

  it("collects who consumed each item", () => {
    const split = {
      method: "itemized" as const,
      serviceChargeCents: 0,
      discountCents: 0,
      items: [
        {
          id: "i1",
          description: "Porção",
          totalCents: 1000,
          quantity: Fraction.of(1),
          consumption: [{ participantId: "dani", quantity: Fraction.of(1) }],
        },
      ],
    };
    expect(peopleInExpense(payers, split)).toEqual(new Set(["ana", "dani"]));
  });
});

describe("assertPeopleInOuting", () => {
  it("accepts people who take part in the outing", () => {
    expect(() => assertPeopleInOuting(new Set(["ana"]), new Set(["ana", "bia"]))).not.toThrow();
  });

  it("rejects someone outside the outing", () => {
    expect(() => assertPeopleInOuting(new Set(["ana", "zé"]), new Set(["ana"]))).toThrowError(
      expect.objectContaining({ code: "person_not_in_outing" }),
    );
  });
});

describe("assertCanChangeExpense", () => {
  it("lets whoever registered it and the admin change it", () => {
    expect(() => assertCanChangeExpense("ana", "ana", "member")).not.toThrow();
    expect(() => assertCanChangeExpense("ana", "bia", "admin")).not.toThrow();
  });

  it("does not let other participants change it", () => {
    expect(() => assertCanChangeExpense("ana", "bia", "member")).toThrowError(
      expect.objectContaining({ code: "only_registrant_or_admin_changes_expense" }),
    );
  });
});

describe("assertCanRegisterExpense", () => {
  it("lets the admin and declared payers register", () => {
    expect(() => assertCanRegisterExpense("admin", false)).not.toThrow();
    expect(() => assertCanRegisterExpense("member", true)).not.toThrow();
  });

  it("does not let other participants register", () => {
    expect(() => assertCanRegisterExpense("member", false)).toThrowError(
      expect.objectContaining({ code: "only_payers_register_expense" }),
    );
  });
});

describe("assertPayersAllowed", () => {
  const payers = [
    { participantId: "ana", amountCents: 600 },
    { participantId: "bia", amountCents: 400 },
  ];

  it("accepts when everyone who paid is allowed", () => {
    expect(() => assertPayersAllowed(payers, new Set(["ana", "bia", "caio"]))).not.toThrow();
  });

  it("rejects someone who is not the admin or a declared payer", () => {
    expect(() => assertPayersAllowed(payers, new Set(["ana"]))).toThrowError(
      expect.objectContaining({ code: "payer_not_declared" }),
    );
  });
});
