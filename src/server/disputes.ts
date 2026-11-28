import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { expenseDisputeApprovals, expenseDisputes, expenses, outingReopenings, outings } from "@/db/schema";
import {
  disputeOutcome,
  equalSplitWithout,
  openDispute as openDisputeDomain,
  requiredApprovers,
  type ApprovalDecision,
  type DisputeStatus,
  type DisputeSubject,
  type ExpenseDispute,
} from "@/domain/dispute";
import { assertLateDisputeConfirmed, disputeWindow } from "@/domain/dispute-window";
import { DomainError } from "@/domain/domain-error";
import { outingReopened } from "@/domain/notification";
import { reviseExpense as reviseExpenseDomain } from "@/domain/expense";
import { insertVersion, loadCurrent, outingContext, toDomainInput } from "./expenses";
import { notify } from "./push";
import { getEffectiveSettings } from "./outing-settings";

export type DisputeView = {
  id: string;
  expenseId: string;
  openedBy: { id: string; name: string };
  subject: DisputeSubject;
  message: string;
  status: DisputeStatus;
  createdAt: Date;
  resultExpenseId: string | null;
  approvals: { personId: string; name: string; decision: ApprovalDecision; note: string | null }[];
  canDecide: boolean;
};

export async function openDispute(
  personId: string,
  outingId: string,
  expenseId: string,
  input: { subject: DisputeSubject; message: string; confirmLate?: boolean },
  now: Date = new Date(),
): Promise<string> {
  const context = await outingContext(personId, outingId);
  const closed = context.outing.status !== "active";
  const [closing] = closed ? await getDb().select({ closedAt: outings.closedAt, closedBy: outings.closedBy }).from(outings).where(eq(outings.id, outingId)) : [];
  const windowDays = closed ? (await getEffectiveSettings(outingId)).disputeWindowDays : undefined;
  const window = disputeWindow(closing?.closedAt ?? null, now, windowDays);
  assertLateDisputeConfirmed(window, input.confirmLate === true, windowDays);
  const current = await loadCurrent(outingId, expenseId, context.names);

  const openOnes = await getDb()
    .select({ openedBy: expenseDisputes.openedBy })
    .from(expenseDisputes)
    .where(and(eq(expenseDisputes.expenseId, expenseId), eq(expenseDisputes.status, "open")));
  const dispute = openDisputeDomain(
    current,
    openOnes.map((row) => ({ expenseId, openedBy: row.openedBy, status: "open" }) as ExpenseDispute),
    { id: crypto.randomUUID(), openedBy: personId, subject: input.subject, message: input.message, openedAt: new Date() },
  );

  const adminIds = context.participants.filter((participant) => participant.role === "admin").map((participant) => participant.personId);
  const approvers = requiredApprovers(input.subject, adminIds, current.payers.map((payer) => payer.participantId));

  // On a closed outing the database policies (written for open ones) refuse the insert, so the
  // write goes through the server after every check above.
  const run = closed ? asService : <T,>(work: () => Promise<T>) => work();
  await run(() =>
    getDb().transaction(async (tx) => {
      await tx.insert(expenseDisputes).values({
        id: dispute.id,
        outingId,
        expenseId,
        openedBy: personId,
        subject: dispute.subject,
        message: dispute.message,
      });
      await tx.insert(expenseDisputeApprovals).values(approvers.map((approver) => ({ disputeId: dispute.id, personId: approver })));
      if (window === "late" && closing?.closedAt) {
        await tx.update(outings).set({ status: "active", closedAt: null, closedBy: null }).where(and(eq(outings.id, outingId), eq(outings.status, "closed")));
        await tx.insert(outingReopenings).values({
          outingId,
          disputeId: dispute.id,
          reopenedBy: personId,
          reopenedAt: now,
          previousClosedAt: closing.closedAt,
          previousClosedBy: closing.closedBy,
        });
      }
    }),
  );
  if (window === "late") {
    const notice = outingReopened({ outingId, outingName: context.outing.name, personName: context.names.get(personId) ?? "Alguém" });
    await Promise.all(context.participants.filter((participant) => participant.personId !== personId).map((participant) => notify(participant.personId, notice)));
  }
  return dispute.id;
}

export async function listDisputes(personId: string, outingId: string, expenseId?: string): Promise<DisputeView[]> {
  const context = await outingContext(personId, outingId);
  const rows = await getDb()
    .select()
    .from(expenseDisputes)
    .where(expenseId ? and(eq(expenseDisputes.outingId, outingId), eq(expenseDisputes.expenseId, expenseId)) : eq(expenseDisputes.outingId, outingId))
    .orderBy(desc(expenseDisputes.createdAt));
  if (rows.length === 0) {
    return [];
  }

  const approvals = await getDb()
    .select()
    .from(expenseDisputeApprovals)
    .where(inArray(expenseDisputeApprovals.disputeId, rows.map((row) => row.id)))
    .orderBy(asc(expenseDisputeApprovals.personId));
  const nameOf = (id: string) => context.names.get(id) ?? "Pessoa";
  return rows.map((row) => {
    const mine = approvals.filter((approval) => approval.disputeId === row.id);
    return {
      id: row.id,
      expenseId: row.expenseId,
      openedBy: { id: row.openedBy, name: nameOf(row.openedBy) },
      subject: row.subject,
      message: row.message,
      status: row.status,
      createdAt: row.createdAt,
      resultExpenseId: row.resultExpenseId,
      approvals: mine.map((approval) => ({ personId: approval.personId, name: nameOf(approval.personId), decision: approval.decision, note: approval.note })),
      canDecide: row.status === "open" && mine.some((approval) => approval.personId === personId && approval.decision === "pending"),
    };
  });
}

export async function decideDispute(personId: string, outingId: string, disputeId: string, decision: { approve: boolean; note: string }) {
  const context = await outingContext(personId, outingId);
  const adminId = context.participants.find((participant) => participant.role === "admin")?.personId;
  if (!adminId) {
    throw new DomainError("outing_not_found", "Rolê não encontrado.");
  }
  const note = decision.note.trim() === "" ? null : decision.note.trim();

  await asService(() =>
    getDb().transaction(async (tx) => {
      const [dispute] = await tx
        .select()
        .from(expenseDisputes)
        .where(and(eq(expenseDisputes.id, disputeId), eq(expenseDisputes.outingId, outingId), eq(expenseDisputes.status, "open")))
        .for("update");
      if (!dispute) {
        throw new DomainError("dispute_already_resolved", "Esta contestação já foi decidida.");
      }

      const decided = await tx
        .update(expenseDisputeApprovals)
        .set({ decision: decision.approve ? "approved" : "rejected", note, decidedAt: new Date() })
        .where(
          and(
            eq(expenseDisputeApprovals.disputeId, disputeId),
            eq(expenseDisputeApprovals.personId, personId),
            eq(expenseDisputeApprovals.decision, "pending"),
          ),
        )
        .returning({ id: expenseDisputeApprovals.personId });
      if (decided.length === 0) {
        throw new DomainError("not_an_approver", "Você não precisa decidir esta contestação.");
      }

      const all = await tx.select({ decision: expenseDisputeApprovals.decision }).from(expenseDisputeApprovals).where(eq(expenseDisputeApprovals.disputeId, disputeId));
      const outcome = disputeOutcome(all.map((row) => row.decision));
      if (outcome === "open") {
        return;
      }

      let resultExpenseId: string | null = null;
      if (outcome === "approved" && dispute.subject === "not_participated") {
        const current = await loadCurrent(outingId, dispute.expenseId, context.names, tx);
        if (current.status !== "active") {
          throw new DomainError("expense_not_active", "A despesa mudou desde a contestação. Recuse esta contestação e abra outra.");
        }
        const input = {
          description: current.description,
          totalCents: current.totalCents,
          payers: current.payers.map((payer) => ({ personId: payer.participantId, amountCents: payer.amountCents })),
          split: { method: "equal" as const, personIds: equalSplitWithout(current, dispute.openedBy).participantIds },
          occurredAt: current.occurredAt,
        };
        const { revision } = reviseExpenseDomain(current, {
          id: crypto.randomUUID(),
          description: input.description,
          totalCents: input.totalCents,
          ...toDomainInput(input),
          registeredBy: adminId,
          occurredAt: input.occurredAt,
          createdAt: new Date(),
        });
        await insertVersion(tx, outingId, adminId, revision, undefined);
        await tx.update(expenses).set({ status: "superseded" }).where(and(eq(expenses.id, current.id), eq(expenses.status, "active")));
        resultExpenseId = revision.id;
      }

      await tx
        .update(expenseDisputes)
        .set({ status: outcome, decidedAt: new Date(), resultExpenseId })
        .where(eq(expenseDisputes.id, disputeId));
    }),
  );
}
