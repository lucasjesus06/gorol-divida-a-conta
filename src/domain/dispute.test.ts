import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { disputeOutcome, equalSplitWithout, hasOpenDispute, openDispute, requiredApprovers } from "./dispute";
import { reviseExpense } from "./expense";

const AT = new Date("2026-11-10T12:00:00Z");

const bbq = () =>
  anExpense({
    outingId: "churrasco",
    description: "Carne",
    payers: [{ participantId: "lucas", amountCents: 30000 }],
    split: { method: "equal", participantIds: ["lucas", "maria", "pedro"] },
  });

const disputeBy = (openedBy: string) =>
  openDispute(bbq(), [], {
    id: "dispute-1",
    openedBy,
    subject: "split",
    message: "Não comi carne, só a salada.",
    openedAt: AT,
  });

describe("expense disputes", () => {
  it("lets a participant ask to review the split", () => {
    const dispute = disputeBy("maria");
    expect(dispute.status).toBe("open");
    expect(hasOpenDispute("maria", "churrasco", [dispute])).toBe(true);
    expect(hasOpenDispute("pedro", "churrasco", [dispute])).toBe(false);
  });

  it("is only for people involved in the expense", () => {
    expect(() => disputeBy("intruso")).toThrow("Só quem participa");
  });

  it("does not allow two open disputes from the same person for the same expense", () => {
    const first = disputeBy("maria");
    expect(() =>
      openDispute(bbq(), [first], {
        id: "dispute-2",
        openedBy: "maria",
        subject: "amount",
        message: "De novo",
        openedAt: AT,
      }),
    ).toThrow("já tem uma contestação");
  });

  it("accepting leads to a new version, and the open flag goes away", () => {
    const dispute = { ...disputeBy("maria"), status: "approved" as const };
    expect(hasOpenDispute("maria", "churrasco", [dispute])).toBe(false);

    const { revision } = reviseExpense(bbq(), {
      id: "expense-2",
      description: "Carne",
      totalCents: 30000,
      payers: [{ participantId: "lucas", amountCents: 30000 }],
      split: {
        method: "exact",
        shares: [
          { participantId: "lucas", amountCents: 13000 },
          { participantId: "maria", amountCents: 4000 },
          { participantId: "pedro", amountCents: 13000 },
        ],
      },
      registeredBy: "lucas",
      occurredAt: AT,
      createdAt: AT,
    });
    expect(revision.shares.get("maria")).toBe(4000);
  });

  it("\"I did not take part\" is only for equal splits and for people who did not pay", () => {
    const open = (openedBy: string, expense = bbq()) =>
      openDispute(expense, [], { id: "d", openedBy, subject: "not_participated", message: "Não fui", openedAt: AT });
    expect(open("maria").subject).toBe("not_participated");
    expect(() => open("lucas")).toThrowError(expect.objectContaining({ code: "payer_cannot_opt_out" }));
    const exact = anExpense({
      outingId: "churrasco",
      payers: [{ participantId: "lucas", amountCents: 30000 }],
      split: { method: "exact", shares: [{ participantId: "lucas", amountCents: 15000 }, { participantId: "maria", amountCents: 15000 }] },
    });
    expect(() => open("maria", exact)).toThrowError(expect.objectContaining({ code: "not_participated_needs_equal_split" }));
  });
});

describe("who approves", () => {
  it("amount and split disputes are decided by the admin alone", () => {
    expect(requiredApprovers("amount", ["lucas"], ["lucas", "ana"])).toEqual(["lucas"]);
    expect(requiredApprovers("split", ["lucas"], ["ana"])).toEqual(["lucas"]);
  });

  it("\"I did not take part\" needs the admin and every payer, without repeating anyone", () => {
    expect(requiredApprovers("not_participated", ["lucas"], ["lucas", "ana"]).sort()).toEqual(["ana", "lucas"]);
  });

  it("is accepted only when everyone agrees, and one refusal rejects it", () => {
    expect(disputeOutcome(["approved", "approved"])).toBe("approved");
    expect(disputeOutcome(["approved", "pending"])).toBe("open");
    expect(disputeOutcome(["approved", "rejected"])).toBe("rejected");
    expect(disputeOutcome(["pending", "rejected"])).toBe("rejected");
    expect(disputeOutcome([])).toBe("open");
  });
});

describe("equalSplitWithout", () => {
  it("takes the person out of the equal split", () => {
    expect(equalSplitWithout(bbq(), "maria")).toEqual({ method: "equal", participantIds: ["lucas", "pedro"] });
  });
});
