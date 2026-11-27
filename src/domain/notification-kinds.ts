export const notificationKinds = [
  "guest_requested_account",
  "join_requested",
  "payment_declared",
  "bill_part_transferred",
] as const;

export type NotificationKind = (typeof notificationKinds)[number];
