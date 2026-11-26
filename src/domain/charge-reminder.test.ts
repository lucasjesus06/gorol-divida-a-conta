import { describe, expect, it } from "vitest";
import {
  decideReminder,
  pauseReminders,
  recordReminderSent,
  type ReminderState,
} from "./charge-reminder";

// 15:00 in São Paulo (UTC-3).
const AFTERNOON = new Date("2026-11-10T18:00:00Z");

const debtor = (overrides: Partial<ReminderState> = {}): ReminderState => ({
  debtorId: "gustavo",
  outingId: "ubatuba",
  pendingCents: 4000,
  termsAcceptedAt: new Date("2026-11-01T12:00:00Z"),
  hasOpenDispute: false,
  sentAt: [],
  pausedAt: null,
  pausedUntil: null,
  pausesUsed: 0,
  ...overrides,
});

const hoursLater = (date: Date, hours: number) => new Date(date.getTime() + hours * 3600_000);

describe("decideReminder", () => {
  it("sends the first reminder during the afternoon", () => {
    expect(decideReminder(debtor(), AFTERNOON)).toEqual({
      action: "send",
      sequence: 1,
      offerPause: false,
    });
  });

  it("stops once there is nothing left to pay", () => {
    expect(decideReminder(debtor({ pendingCents: 0 }), AFTERNOON)).toEqual({
      action: "stop",
      reason: "nothing_owed",
    });
  });

  it("does not remind someone who has not accepted the terms of use", () => {
    expect(decideReminder(debtor({ termsAcceptedAt: null }), AFTERNOON)).toEqual({
      action: "blocked",
      reason: "terms_not_accepted",
    });
  });

  it("holds reminders while the person's dispute waits for the admin", () => {
    expect(decideReminder(debtor({ hasOpenDispute: true }), AFTERNOON)).toEqual({
      action: "hold",
      reason: "open_dispute",
    });
  });

  it("respects the minimum interval between reminders", () => {
    const state = debtor({ sentAt: [hoursLater(AFTERNOON, -2)] });
    expect(decideReminder(state, AFTERNOON)).toEqual({
      action: "wait",
      until: hoursLater(AFTERNOON, 22),
      reason: "min_interval",
    });
  });

  it("waits for the morning instead of reminding at night", () => {
    // 23:30 in São Paulo: next window opens at 10:00 the following day (13:00 UTC).
    const night = new Date("2026-11-11T02:30:00Z");
    expect(decideReminder(debtor(), night)).toEqual({
      action: "wait",
      until: new Date("2026-11-11T13:00:00Z"),
      reason: "outside_window",
    });
  });

  it("offers a pause on the third reminder", () => {
    const state = debtor({ sentAt: [hoursLater(AFTERNOON, -72), hoursLater(AFTERNOON, -48)] });
    expect(decideReminder(state, AFTERNOON)).toMatchObject({ action: "send", offerPause: true });
  });
});

describe("pausing reminders", () => {
  const threeReminders = debtor({
    sentAt: [hoursLater(AFTERNOON, -72), hoursLater(AFTERNOON, -48), hoursLater(AFTERNOON, -24)],
  });

  it("pauses for some days and then resumes, because the debt is still there", () => {
    const paused = pauseReminders(threeReminders, AFTERNOON);
    expect(decideReminder(paused, hoursLater(AFTERNOON, 24))).toMatchObject({
      action: "wait",
      reason: "paused",
    });
    const afterPause = decideReminder(paused, hoursLater(AFTERNOON, 72));
    expect(afterPause).toMatchObject({ action: "send", sequence: 4, offerPause: false });
  });

  it("is only available after a few reminders", () => {
    expect(() => pauseReminders(debtor({ sentAt: [AFTERNOON] }), AFTERNOON)).toThrow(
      "depois de algumas",
    );
  });

  it("has a limit", () => {
    let state = pauseReminders(threeReminders, AFTERNOON);
    for (let day = 4; day <= 6; day += 1) {
      state = recordReminderSent(state, hoursLater(AFTERNOON, day * 24));
    }
    state = pauseReminders(state, hoursLater(AFTERNOON, 7 * 24));
    expect(state.pausesUsed).toBe(2);
    expect(() => pauseReminders(state, hoursLater(AFTERNOON, 20 * 24))).toThrow("limite");
  });
});
