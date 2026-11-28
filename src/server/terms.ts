import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { termsAcceptances } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { TERMS_VERSION, assertCanAccept, hasAcceptedCurrentTerms, type TermsAcceptance } from "@/domain/terms";

const current = (personId: string) => and(eq(termsAcceptances.personId, personId), eq(termsAcceptances.version, TERMS_VERSION));

/** The person's acceptance of the current terms, or null when they still have to accept. */
export async function getAcceptance(personId: string): Promise<TermsAcceptance | null> {
  const [row] = await asService(() =>
    getDb()
      .select({
        version: termsAcceptances.version,
        acceptedAt: termsAcceptances.acceptedAt,
        remindersConsent: termsAcceptances.remindersConsent,
        remindersWithdrawnAt: termsAcceptances.remindersWithdrawnAt,
      })
      .from(termsAcceptances)
      .where(current(personId)),
  );
  return row ?? null;
}

export async function hasAcceptedTerms(personId: string): Promise<boolean> {
  return hasAcceptedCurrentTerms(await getAcceptance(personId));
}

/** Records the acceptance of the current terms, with the consent to payment reminders. Safe to repeat. */
export async function acceptTerms(personId: string, input: { acceptedTerms: boolean; acceptedReminders: boolean }): Promise<void> {
  assertCanAccept(input);
  await asService(() =>
    getDb().insert(termsAcceptances).values({ personId, version: TERMS_VERSION, remindersConsent: true }).onConflictDoNothing(),
  );
}

/** Stops the payment reminders for this person; the debts stay exactly as they are. */
export async function withdrawRemindersConsent(personId: string): Promise<void> {
  const changed = await asService(() =>
    getDb()
      .update(termsAcceptances)
      .set({ remindersWithdrawnAt: new Date() })
      .where(and(current(personId), isNull(termsAcceptances.remindersWithdrawnAt)))
      .returning({ id: termsAcceptances.id }),
  );
  if (changed.length === 0 && !(await getAcceptance(personId))) {
    throw new DomainError("terms_not_accepted", "Para usar o GoRolê, aceite os termos de uso.");
  }
}

export async function restoreRemindersConsent(personId: string): Promise<void> {
  await asService(() => getDb().update(termsAcceptances).set({ remindersWithdrawnAt: null }).where(current(personId)));
}
