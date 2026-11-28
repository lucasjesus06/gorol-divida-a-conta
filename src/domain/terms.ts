import { DomainError } from "./domain-error";

/** Changes whenever the text of the terms changes; everybody then accepts again. */
export const TERMS_VERSION = "2026-11-28";

export type TermsAcceptance = {
  version: string;
  acceptedAt: Date;
  remindersConsent: boolean;
  remindersWithdrawnAt: Date | null;
};

export function hasAcceptedCurrentTerms(acceptance: TermsAcceptance | null): boolean {
  return acceptance !== null && acceptance.version === TERMS_VERSION;
}

/**
 * When the person agreed to receive payment reminders, or null when reminders must not be sent:
 * no acceptance of the current terms, or the consent was withdrawn.
 */
export function remindersConsentedAt(acceptance: TermsAcceptance | null): Date | null {
  if (!acceptance || !hasAcceptedCurrentTerms(acceptance)) return null;
  if (!acceptance.remindersConsent || acceptance.remindersWithdrawnAt !== null) return null;
  return acceptance.acceptedAt;
}

/** Both boxes are needed to use the app: the terms and the reminders that come with the debts. */
export function assertCanAccept(input: { acceptedTerms: boolean; acceptedReminders: boolean }): void {
  if (!input.acceptedTerms) {
    throw new DomainError("terms_not_accepted", "Para usar o GoRolê, aceite os termos de uso.");
  }
  if (!input.acceptedReminders) {
    throw new DomainError("reminders_consent_required", "Para usar o GoRolê, aceite receber lembretes de pagamento.");
  }
}
