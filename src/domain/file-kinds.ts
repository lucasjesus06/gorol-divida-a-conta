export const fileKinds = ["expense_evidence", "payment_receipt", "profile_photo"] as const;
export type FileKind = (typeof fileKinds)[number];

export const fileStatuses = ["pending", "ready"] as const;
export type FileStatus = (typeof fileStatuses)[number];
