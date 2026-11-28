export const closingVoteStatuses = ["open", "approved", "rejected", "cancelled"] as const;
export type ClosingVoteStatus = (typeof closingVoteStatuses)[number];

export const closingVoteDecisions = ["pending", "accepted", "rejected"] as const;
export type ClosingVoteDecision = (typeof closingVoteDecisions)[number];
