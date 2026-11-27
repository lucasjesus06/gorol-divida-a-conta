export const billStatuses = ["open", "closing", "closed"] as const;
export const leftoverModes = ["spread", "transfer"] as const;

export type BillStatus = (typeof billStatuses)[number];
