import "server-only";
import { eq } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { people } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { buildPixPayload, formatPixKey, normalizePixKey, type PixKey, type PixKeyType } from "@/domain/pix";
import { getRelationDetail, relationNet } from "./balances";

async function readKey(personId: string): Promise<PixKey | null> {
  const [row] = await getDb()
    .select({ value: people.pixKey, type: people.pixKeyType })
    .from(people)
    .where(eq(people.id, personId));
  return row?.value && row.type ? { type: row.type, value: row.value } : null;
}

/** The person's own key, for the settings screen. */
export async function getMyPixKey(personId: string): Promise<(PixKey & { display: string }) | null> {
  const key = await asService(() => readKey(personId));
  return key ? { ...key, display: formatPixKey(key) } : null;
}

export async function hasPixKey(personId: string): Promise<boolean> {
  return (await asService(() => readKey(personId))) !== null;
}

export async function savePixKey(personId: string, input: { type: PixKeyType; value: string }): Promise<void> {
  const key = normalizePixKey(input.type, input.value);
  await asService(() =>
    getDb().update(people).set({ pixKey: key.value, pixKeyType: key.type }).where(eq(people.id, personId)),
  );
}

export type PixPayment = { display: string; payload: string; receiverName: string };

/**
 * What the debtor needs to pay a creditor by Pix. The key is private: it is only
 * handed to someone who currently owes that person, and never above what is owed.
 */
export async function getPixPayment(
  requesterId: string,
  creditorId: string,
  amountCents: number,
): Promise<PixPayment> {
  const relation = await getRelationDetail(requesterId, creditorId);
  const owed = -relationNet(relation);
  if (owed <= 0 || amountCents > owed) {
    throw new DomainError("pix_not_allowed", "Você só vê a chave Pix de quem você deve, até o valor devido.");
  }
  const key = await asService(() => readKey(creditorId));
  if (!key) {
    throw new DomainError("no_pix_key", `${relation.name} ainda não cadastrou uma chave Pix.`);
  }
  return {
    display: formatPixKey(key),
    payload: buildPixPayload({ key, amountCents, receiverName: relation.name }),
    receiverName: relation.name,
  };
}
