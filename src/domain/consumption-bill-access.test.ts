import { describe, expect, it } from "vitest";
import {
  assertBillOpen,
  assertCanClaimFor,
  assertCanCloseBill,
} from "./consumption-bill-access";

describe("consumption bill access", () => {
  it("lets each person mark their own consumption, and the admin mark anyone's", () => {
    expect(() => assertCanClaimFor("ana", "ana", "member")).not.toThrow();
    expect(() => assertCanClaimFor("bia", "ana", "admin")).not.toThrow();
    expect(() => assertCanClaimFor("bia", "ana", "member")).toThrowError(
      expect.objectContaining({ code: "only_admin_claims_for_others" }),
    );
  });

  it("lets whoever opened the bill or the admin close it", () => {
    expect(() => assertCanCloseBill("ana", "ana", "member")).not.toThrow();
    expect(() => assertCanCloseBill("ana", "bia", "admin")).not.toThrow();
    expect(() => assertCanCloseBill("ana", "bia", "member")).toThrowError(
      expect.objectContaining({ code: "only_opener_or_admin_closes_bill" }),
    );
  });

  it("does not change a closed bill", () => {
    expect(() => assertBillOpen("open")).not.toThrow();
    expect(() => assertBillOpen("closed")).toThrowError(
      expect.objectContaining({ code: "bill_already_closed" }),
    );
  });
});
