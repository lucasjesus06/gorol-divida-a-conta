import { describe, expect, it } from "vitest";
import { anExpense } from "@/test/expense-fixtures";
import { hasOpenDispute, openDispute, resolveDispute } from "./dispute";
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

  it("is decided only by the outing admin, and approval leads to a new version", () => {
    const dispute = disputeBy("maria");
    expect(() =>
      resolveDispute(dispute, {
        by: "pedro",
        outingAdminId: "lucas",
        approved: true,
        note: "",
        at: AT,
      }),
    ).toThrow("Só o dono");

    const approved = resolveDispute(dispute, {
      by: "lucas",
      outingAdminId: "lucas",
      approved: true,
      note: "Maria fica só com a salada",
      at: AT,
    });
    expect(approved.status).toBe("approved");
    expect(hasOpenDispute("maria", "churrasco", [approved])).toBe(false);

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

  it("keeps the rejection with the admin's note", () => {
    const rejected = resolveDispute(disputeBy("maria"), {
      by: "lucas",
      outingAdminId: "lucas",
      approved: false,
      note: "Combinamos dividir igual",
      at: AT,
    });
    expect(rejected).toMatchObject({
      status: "rejected",
      resolutionNote: "Combinamos dividir igual",
    });
  });
});
