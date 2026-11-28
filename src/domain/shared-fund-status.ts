export const sharedFundStatuses = ["pending", "active", "declined", "ended"] as const;
export type SharedFundStatus = (typeof sharedFundStatuses)[number];
