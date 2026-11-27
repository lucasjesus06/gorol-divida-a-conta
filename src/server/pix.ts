import "server-only";
import { eq } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { people } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import { buildPixPayload, formatPixKey, normalizePixKey, type PixKey, type PixKeyType } from "@/domain/pix";
import { getOutingBalances, getRelationDetail, relationNet } from "./balances";

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
 * handed to someone who has to pay that person, either because they owe them
 * directly or because a route of this outing tells them to, and never above that amount.
 */
export async function getPixPayment(
  requesterId: string,
  outingId: string,
  creditorId: string,
  amountCents: number,
): Promise<PixPayment> {
  const relation = await getRelationDetail(requesterId, creditorId);
  const owedDirectly = Math.max(-relationNet(relation), 0);
  const balances = await getOutingBalances(requesterId, outingId);
  const routed = [...balances.smart, ...balances.manual]
    .filter((transfer) => transfer.fromId === requesterId && transfer.toId === creditorId)
    .reduce((max, transfer) => Math.max(max, transfer.amountCents), 0);

  if (amountCents <= 0 || amountCents > Math.max(owedDirectly, routed)) {
    throw new DomainError("pix_not_allowed", "Você só vê a chave Pix de quem você precisa pagar, até o valor devido.");
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
