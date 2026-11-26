export const outingKinds = ["event", "recurring"] as const;
export type OutingKind = (typeof outingKinds)[number];

export const outingStatuses = ["active", "closed"] as const;
export type OutingStatus = (typeof outingStatuses)[number];

export const outingRoles = ["admin", "member"] as const;
export type OutingRole = (typeof outingRoles)[number];
