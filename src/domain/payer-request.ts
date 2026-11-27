export const payerRequestStatuses = ["pending", "approved", "rejected"] as const;
export type PayerRequestStatus = (typeof payerRequestStatuses)[number];
