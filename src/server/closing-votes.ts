import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { closingVoteChoices, closingVotes, people } from "@/db/schema";
import {
  assertCanAskForVote,
  balanceSnapshot,
  closingVoteDeadline,
  closingVoteOutcome,
  closingVoters,
  ownerClosesAlone,
  type ClosingVoteDecision,
  type ClosingVoteStatus,
} from "@/domain/closing-vote";
import { DomainError } from "@/domain/domain-error";
import { closingVoteRequested, closingVoteResolved } from "@/domain/notification";
import { assertAdmin } from "@/domain/outing-access";
import { closeBlockers } from "@/domain/outing-closing";
import { assertActiveOuting, outingContext, readOutingContext } from "./expenses";
import { closeInput, finalizeClose } from "./outing-lifecycle";
import { notify } from "./push";
import { getEffectiveSettings } from "./outing-settings";

type Context = Awaited<ReturnType<typeof outingContext>>;

/** Tells the owner and everyone who had a say how a vote that did not close the outing ended. */
async function tellResult(vote: { requestedBy: string }, voterIds: string[], outingId: string, context: Context, result: "rejected" | "cancelled") {
  const notice = closingVoteResolved({ outingId, outingName: context.outing.name, result });
  await Promise.all([...new Set([vote.requestedBy, ...voterIds])].map((personId) => notify(personId, notice)));
}

async function finish(voteId: string, status: Exclude<ClosingVoteStatus, "open">, now: Date): Promise<boolean> {
  const done = await asService(() =>
    getDb()
      .update(closingVotes)
      .set({ status, resolvedAt: now })
      .where(and(eq(closingVotes.id, voteId), eq(closingVotes.status, "open")))
      .returning({ id: closingVotes.id }),
  );
  return done.length > 0;
}

/**
 * Settles the open vote of the outing if it can be settled: cancelled when the balances (or
 * anything else that blocks closing) changed since people voted, refused on a "no", approved when
 * everybody accepted or the deadline passed in silence. Safe to call at any time; also meant for a
 * scheduled job if one exists later.
 */
export async function resolveClosing(outingId: string, now: Date = new Date()): Promise<void> {
  const [vote] = await asService(() => getDb().select().from(closingVotes).where(and(eq(closingVotes.outingId, outingId), eq(closingVotes.status, "open"))));
  if (!vote) {
    return;
  }
  const choices = await asService(() => getDb().select().from(closingVoteChoices).where(eq(closingVoteChoices.voteId, vote.id)));
  const voterIds = choices.map((choice) => choice.personId);
  const context = await outingContext(vote.requestedBy, outingId).catch(() => null);

  if (!context || context.outing.status !== "active") {
    await finish(vote.id, "cancelled", now);
    return;
  }
  const input = await closeInput(outingId, context.names);
  const changed = balanceSnapshot(input.people) !== vote.snapshot || closeBlockers(input).some((blocker) => blocker.code !== "open_balance");
  if (changed) {
    if (await finish(vote.id, "cancelled", now)) {
      await tellResult(vote, voterIds, outingId, context, "cancelled");
    }
    return;
  }

  const outcome = closingVoteOutcome(choices.map((choice) => choice.decision), vote.deadline, now);
  if (outcome === "open") {
    return;
  }
  if (!(await finish(vote.id, outcome, now))) {
    return;
  }
  if (outcome === "approved") {
    await finalizeClose(vote.requestedBy, outingId, context);
  } else {
    await tellResult(vote, voterIds, outingId, context, "rejected");
  }
}

/** The owner asks to close an outing that still has open balances. */
export async function requestClosing(ownerId: string, outingId: string, now: Date = new Date()): Promise<{ closed: boolean }> {
  const context = await outingContext(ownerId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  assertActiveOuting(context.outing.status);
  await resolveClosing(outingId, now);

  const [existing] = await getDb().select({ id: closingVotes.id }).from(closingVotes).where(and(eq(closingVotes.outingId, outingId), eq(closingVotes.status, "open")));
  if (existing) {
    throw new DomainError("closing_vote_open", "Já há um pedido de encerramento em andamento.");
  }
  const refreshed = await outingContext(ownerId, outingId);
  if (refreshed.outing.status !== "active") {
    return { closed: true };
  }

  const input = await closeInput(outingId, refreshed.names);
  const blockers = closeBlockers(input);
  if (blockers.length === 0) {
    await finalizeClose(ownerId, outingId, refreshed);
    return { closed: true };
  }

  const indebted = input.people.filter((balance) => balance.netCents < 0).map((balance) => balance.personId);
  const accounts = indebted.length === 0 ? [] : await asService(() => getDb().select({ id: people.id, approved: people.accountApprovedAt }).from(people).where(inArray(people.id, indebted)));
  const withAccount = new Set(accounts.filter((row) => row.approved !== null).map((row) => row.id));
  assertCanAskForVote({
    onlyOpenBalanceBlocks: blockers.every((blocker) => blocker.code === "open_balance"),
    guestsInDebt: indebted.filter((id) => !withAccount.has(id)).map((id) => refreshed.names.get(id) ?? "Pessoa"),
  });

  if (ownerClosesAlone(input.people, ownerId)) {
    await finalizeClose(ownerId, outingId, refreshed);
    return { closed: true };
  }

  const voters = closingVoters(input.people);
  const days = (await getEffectiveSettings(outingId)).voteDays;
  await asService(() =>
    getDb().transaction(async (tx) => {
      const [vote] = await tx
        .insert(closingVotes)
        .values({ outingId, requestedBy: ownerId, snapshot: balanceSnapshot(input.people), deadline: closingVoteDeadline(now, days) })
        .returning({ id: closingVotes.id });
      await tx.insert(closingVoteChoices).values(
        voters.map((personId) => (personId === ownerId ? { voteId: vote.id, personId, decision: "accepted" as const, decidedAt: now } : { voteId: vote.id, personId })),
      );
    }),
  );
  const notice = closingVoteRequested({ outingId, outingName: refreshed.outing.name, ownerName: refreshed.names.get(ownerId) ?? "O dono", days });
  await Promise.all(voters.filter((personId) => personId !== ownerId).map((personId) => notify(personId, notice)));
  return { closed: false };
}

/** A person with money to receive accepts or refuses closing the outing. */
export async function answerClosing(personId: string, outingId: string, accept: boolean, now: Date = new Date()): Promise<void> {
  await outingContext(personId, outingId);
  await resolveClosing(outingId, now);

  const [vote] = await getDb().select().from(closingVotes).where(and(eq(closingVotes.outingId, outingId), eq(closingVotes.status, "open")));
  if (!vote) {
    throw new DomainError("closing_vote_not_found", "Não há pedido de encerramento em andamento.");
  }
  const answered = await asService(() =>
    getDb()
      .update(closingVoteChoices)
      .set({ decision: accept ? "accepted" : "rejected", decidedAt: now })
      .where(and(eq(closingVoteChoices.voteId, vote.id), eq(closingVoteChoices.personId, personId), eq(closingVoteChoices.decision, "pending")))
      .returning({ personId: closingVoteChoices.personId }),
  );
  if (answered.length === 0) {
    throw new DomainError("not_a_voter", "Só quem tem a receber neste rolê responde, e uma vez.");
  }
  await resolveClosing(outingId, now);
}

export type ClosingVoteView = {
  id: string;
  status: ClosingVoteStatus;
  deadline: Date;
  resolvedAt: Date | null;
  requestedBy: { id: string; name: string };
  choices: { personId: string; name: string; decision: ClosingVoteDecision }[];
  /** The person's own pending answer, when they are one of the voters. */
  canAnswer: boolean;
  /** Ended in the last 3 days, so the screen still explains what happened. */
  recentlyEnded: boolean;
};

/** The latest vote of the outing, after settling it if it is due. */
export async function getClosingVote(personId: string, outingId: string, now: Date = new Date()): Promise<ClosingVoteView | null> {
  const context = await readOutingContext(personId, outingId);
  const days = (await getEffectiveSettings(outingId)).voteDays;
  await resolveClosing(outingId, now);

  const [vote] = await getDb().select().from(closingVotes).where(eq(closingVotes.outingId, outingId)).orderBy(desc(closingVotes.createdAt)).limit(1);
  if (!vote) {
    return null;
  }
  const choices = await getDb().select().from(closingVoteChoices).where(eq(closingVoteChoices.voteId, vote.id));
  const nameOf = (id: string) => context.names.get(id) ?? "Pessoa";
  return {
    id: vote.id,
    status: vote.status,
    deadline: vote.deadline,
    resolvedAt: vote.resolvedAt,
    requestedBy: { id: vote.requestedBy, name: nameOf(vote.requestedBy) },
    choices: choices.map((choice) => ({ personId: choice.personId, name: nameOf(choice.personId), decision: choice.decision })),
    canAnswer: vote.status === "open" && choices.some((choice) => choice.personId === personId && choice.decision === "pending"),
    recentlyEnded: vote.resolvedAt !== null && now.getTime() - vote.resolvedAt.getTime() < days * 86_400_000,
  };
}
