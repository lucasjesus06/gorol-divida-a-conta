import { DomainError } from "./domain-error";
import { assertPositiveCents, type Cents } from "./money";

/** What backs the amount informed for an expense. */
export type EvidenceKind = "receipt_photo" | "invoice_screenshot" | "other";

/**
 * Optional proof attached to an expense (photo of the receipt, screenshot of a
 * bill, ...). It is never required, but when present everyone can see that the
 * informed amount comes from somewhere.
 */
export type ExpenseEvidence = {
  id: string;
  kind: EvidenceKind;
  /** Reference to the stored file. */
  fileId: string;
  uploadedBy: string;
  uploadedAt: Date;
  /** Amount shown on the document, when someone informs it. */
  amountCents: Cents | null;
  /** Date shown on the document, when someone informs it. */
  documentDate: Date | null;
};

export type EvidenceStatus =
  | { hasEvidence: false }
  | {
      hasEvidence: true;
      /** null when no evidence informs an amount to compare with. */
      amountMatchesTotal: boolean | null;
    };

export function validateEvidence(evidence: ExpenseEvidence): ExpenseEvidence {
  if (evidence.fileId.trim() === "") {
    throw new DomainError("evidence_file_required", "A evidência precisa de um arquivo anexado.");
  }
  if (evidence.amountCents !== null) {
    assertPositiveCents(evidence.amountCents, "O valor da evidência");
  }
  return evidence;
}

/** "Com evidência" / "sem evidência", and whether the document matches the total. */
export function evidenceStatus(evidence: ExpenseEvidence[], totalCents: Cents): EvidenceStatus {
  if (evidence.length === 0) {
    return { hasEvidence: false };
  }
  const informed = evidence.filter((item) => item.amountCents !== null);
  if (informed.length === 0) {
    return { hasEvidence: true, amountMatchesTotal: null };
  }
  return {
    hasEvidence: true,
    amountMatchesTotal: informed.some((item) => item.amountCents === totalCents),
  };
}
