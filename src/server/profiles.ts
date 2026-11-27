import "server-only";
import { eq } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { people } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";

export type Profile = { personId: string; displayName: string };

async function findProfile(userId: string): Promise<Profile | null> {
  const [profile] = await getDb()
    .select({ personId: people.id, displayName: people.displayName })
    .from(people)
    .where(eq(people.userId, userId))
    .limit(1);
  return profile ?? null;
}

async function loadProfileImpl(userId: string): Promise<Profile | null> {
  return findProfile(userId);
}

async function saveProfileImpl(userId: string, input: { displayName: string; phone: string }): Promise<Profile> {
  const existing = await findProfile(userId);
  if (existing) {
    return existing;
  }

  return getDb().transaction(async (tx) => {
    const [byPhone] = await tx
      .select({ id: people.id, userId: people.userId })
      .from(people)
      .where(eq(people.phone, input.phone))
      .for("update");

    if (byPhone?.userId) {
      throw new DomainError("phone_already_linked", "Este telefone já está vinculado a outra conta.");
    }

    if (byPhone) {
      await tx.update(people).set({ userId, displayName: input.displayName }).where(eq(people.id, byPhone.id));
      return { personId: byPhone.id, displayName: input.displayName };
    }

    const [created] = await tx
      .insert(people)
      .values({ userId, displayName: input.displayName, phone: input.phone })
      .returning({ personId: people.id, displayName: people.displayName });
    return created;
  });
}

export function loadProfile(...args: Parameters<typeof loadProfileImpl>) {
  return asService(() => loadProfileImpl(...args));
}

export function saveProfile(...args: Parameters<typeof saveProfileImpl>) {
  return asService(() => saveProfileImpl(...args));
}
