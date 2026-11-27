import { DomainError } from "./domain-error";
import type { Payer } from "./split";

export const payerRequestStatuses = ["pending", "approved", "rejected"] as const;
export type PayerRequestStatus = (typeof payerRequestStatuses)[number];

export function assertRequesterPays(payers: Payer[], requesterId: string): void {
  if (!payers.some((payer) => payer.participantId === requesterId)) {
    throw new DomainError("requester_must_pay", "Informe quanto você pagou nesta despesa.");
  }
}
