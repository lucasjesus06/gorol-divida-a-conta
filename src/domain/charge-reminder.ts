import { DomainError } from "./domain-error";
import type { Cents } from "./money";

export type ReminderPolicy = {
  /** Minimum time between two reminders to the same person for the same outing. */
  minIntervalHours: number;
  /** Local hours (America/Sao_Paulo) when reminders may be sent: [startHour, endHour). */
  sendWindow: { startHour: number; endHour: number };
  /** After this many reminders in a row, the chat offers to pause the reminders. */
  offerPauseAfter: number;
  pauseDays: number;
  maxPauses: number;
};

export const DEFAULT_REMINDER_POLICY: ReminderPolicy = {
  minIntervalHours: 24,
  sendWindow: { startHour: 10, endHour: 20 },
  offerPauseAfter: 3,
  pauseDays: 3,
  maxPauses: 2,
};

/** Reminder history of one debtor for one outing (rolê). */
export type ReminderState = {
  debtorId: string;
  outingId: string;
  /** What is still left to pay, counting declared payments as done. */
  pendingCents: Cents;
  /** When the person accepted the terms of use, which include payment reminders. */
  termsAcceptedAt: Date | null;
  /** The person contested an expense of this outing and is waiting for the admin's decision. */
  hasOpenDispute: boolean;
  sentAt: Date[];
  pausedAt: Date | null;
  pausedUntil: Date | null;
  pausesUsed: number;
};

export type ReminderDecision =
  | { action: "stop"; reason: "nothing_owed" }
  | { action: "blocked"; reason: "terms_not_accepted" }
  | { action: "hold"; reason: "open_dispute" }
  | { action: "wait"; until: Date; reason: "paused" | "min_interval" | "outside_window" }
  | {
      action: "send";
      /** 1-based number of this reminder, used to rotate the (friendly, meme-like) texts. */
      sequence: number;
      /** Whether this message should offer the option to pause the reminders. */
      offerPause: boolean;
    };

const HOUR_MS = 60 * 60 * 1000;
const TIME_ZONE = "America/Sao_Paulo";

/** Decides whether a payment reminder can go out now, or until when it must wait. */
export function decideReminder(
  state: ReminderState,
  now: Date,
  policy: ReminderPolicy = DEFAULT_REMINDER_POLICY,
): ReminderDecision {
  if (state.pendingCents <= 0) {
    return { action: "stop", reason: "nothing_owed" };
  }
  if (!state.termsAcceptedAt) {
    return { action: "blocked", reason: "terms_not_accepted" };
  }
  if (state.hasOpenDispute) {
    return { action: "hold", reason: "open_dispute" };
  }
  if (state.pausedUntil && state.pausedUntil > now) {
    return { action: "wait", until: state.pausedUntil, reason: "paused" };
  }

  const lastSent = latest(state.sentAt);
  if (lastSent) {
    const allowedAt = new Date(lastSent.getTime() + policy.minIntervalHours * HOUR_MS);
    if (allowedAt > now) {
      return { action: "wait", until: allowedAt, reason: "min_interval" };
    }
  }

  const windowStart = nextWindowStart(now, policy);
  if (windowStart) {
    return { action: "wait", until: windowStart, reason: "outside_window" };
  }

  const sinceResume = remindersSinceLastPause(state);
  return {
    action: "send",
    sequence: state.sentAt.length + 1,
    offerPause: sinceResume + 1 >= policy.offerPauseAfter && state.pausesUsed < policy.maxPauses,
  };
}

/**
 * Pauses the reminders after the person asked to, from the chat.
 * Reminders resume automatically when the pause ends: the debt is not forgiven.
 */
export function pauseReminders(
  state: ReminderState,
  now: Date,
  policy: ReminderPolicy = DEFAULT_REMINDER_POLICY,
): ReminderState {
  if (state.pausesUsed >= policy.maxPauses) {
    throw new DomainError(
      "pause_limit_reached",
      "O limite de pausas das cobranças já foi atingido.",
    );
  }
  if (remindersSinceLastPause(state) < policy.offerPauseAfter) {
    throw new DomainError(
      "pause_not_available",
      "A pausa só fica disponível depois de algumas cobranças.",
    );
  }
  return {
    ...state,
    pausedAt: now,
    pausedUntil: new Date(now.getTime() + policy.pauseDays * 24 * HOUR_MS),
    pausesUsed: state.pausesUsed + 1,
  };
}

export function recordReminderSent(state: ReminderState, at: Date): ReminderState {
  return { ...state, sentAt: [...state.sentAt, at] };
}

function remindersSinceLastPause(state: ReminderState): number {
  const pausedAt = state.pausedAt;
  return pausedAt ? state.sentAt.filter((sent) => sent > pausedAt).length : state.sentAt.length;
}

function latest(dates: Date[]): Date | null {
  let result: Date | null = null;
  for (const date of dates) {
    if (!result || date > result) result = date;
  }
  return result;
}

/** Null when `now` is inside the send window; otherwise when the next window opens. */
function nextWindowStart(now: Date, policy: ReminderPolicy): Date | null {
  const { startHour, endHour } = policy.sendWindow;
  const hour = localHour(now);
  if (hour >= startHour && hour < endHour) return null;

  const hoursAhead = hour < startHour ? startHour - hour : 24 - hour + startHour;
  const startOfCurrentHour = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS;
  return new Date(startOfCurrentHour + hoursAhead * HOUR_MS);
}

function localHour(date: Date): number {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(formatted);
}
