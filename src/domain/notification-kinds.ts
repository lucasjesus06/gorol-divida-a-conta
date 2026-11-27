export const notificationKinds = [
  "guest_requested_account",
  "join_requested",
  "payment_declared",
  "bill_part_transferred",
  "payment_reminder",
  "outing_closed",
  "participant_removed",
  "participant_left",
  "closing_vote_requested",
  "closing_vote_resolved",
] as const;

export type NotificationKind = (typeof notificationKinds)[number];
