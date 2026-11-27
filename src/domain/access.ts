export const accessRequestStatuses = ["pending", "approved", "rejected"] as const;
export type AccessRequestStatus = (typeof accessRequestStatuses)[number];

export const accessRequestSources = ["request", "invite"] as const;
export type AccessRequestSource = (typeof accessRequestSources)[number];
