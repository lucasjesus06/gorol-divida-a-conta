import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { accessInvites, accessRequests, outingParticipants, outings, people, superAdmins } from "@/db/schema";
import { inviteExpiry, normalizeEmail } from "@/domain/access";
import { DomainError } from "@/domain/domain-error";
import { guestRequestedAccount } from "@/domain/notification";
import { normalizeDisplayName } from "@/domain/person";
import { normalizePhone } from "@/domain/phone";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyOutingOwners } from "./push";
import { hashToken, newToken } from "./token";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type AccountData = { name: string; email: string; phone: string };

function normalizeAccountData(input: { name: string; email: string; phone: string }): AccountData {
  return {
    name: normalizeDisplayName(input.name),
    email: normalizeEmail(input.email),
    phone: normalizePhone(input.phone),
  };
}

async function createAuthUser(email: string) {
  const { data, error } = await createSupabaseAdminClient().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === "email_exists") {
      throw new DomainError("email_already_registered", "Já existe uma conta com este e-mail.");
    }
    throw new Error(`Não foi possível criar o acesso: ${error?.message ?? "sem resposta"}`);
  }
  return data.user.id;
}

async function removeAuthUser(userId: string) {
  await createSupabaseAdminClient().auth.admin.deleteUser(userId);
}

async function approveGuestPerson(tx: Tx, userId: string, data: AccountData, guestUserId: string) {
  const [guest] = await tx
    .select({ id: people.id, accountApprovedAt: people.accountApprovedAt })
    .from(people)
    .where(eq(people.userId, guestUserId))
    .for("update");
  if (!guest || guest.accountApprovedAt !== null) {
    return null;
  }
  await tx
    .update(people)
    .set({ userId, displayName: data.name, accountApprovedAt: sql`now()` })
    .where(eq(people.id, guest.id));
  await tx
    .update(outingParticipants)
    .set({ confirmedAt: sql`now()` })
    .where(and(eq(outingParticipants.personId, guest.id), isNull(outingParticipants.confirmedAt)));
  return guest.id;
}

async function approvePerson(tx: Tx, userId: string, data: AccountData, guestUserId: string | null) {
  if (guestUserId) {
    const guestPersonId = await approveGuestPerson(tx, userId, data, guestUserId);
    if (guestPersonId) {
      return guestPersonId;
    }
  }
  const [byPhone] = await tx
    .select({ id: people.id, userId: people.userId })
    .from(people)
    .where(eq(people.phone, data.phone))
    .for("update");
  if (byPhone?.userId) {
    throw new DomainError("phone_already_linked", "Este telefone já está vinculado a outra conta.");
  }
  if (byPhone) {
    await tx
      .update(people)
      .set({ userId, displayName: data.name, accountApprovedAt: sql`now()` })
      .where(eq(people.id, byPhone.id));
    await tx
      .update(outingParticipants)
      .set({ confirmedAt: sql`now()` })
      .where(and(eq(outingParticipants.personId, byPhone.id), isNull(outingParticipants.confirmedAt)));
    return byPhone.id;
  }
  const [created] = await tx
    .insert(people)
    .values({ userId, displayName: data.name, phone: data.phone, accountApprovedAt: sql`now()` })
    .returning({ id: people.id });
  return created.id;
}

async function provision<T>(
  data: AccountData,
  record: (tx: Tx, personId: string) => Promise<T>,
  guestUserId: string | null = null,
) {
  const userId = await createAuthUser(data.email);
  try {
    return await getDb().transaction(async (tx) => record(tx, await approvePerson(tx, userId, data, guestUserId)));
  } catch (error) {
    await removeAuthUser(userId);
    throw error;
  }
}

async function isSuperAdminImpl(userId: string) {
  const [row] = await getDb().select({ userId: superAdmins.userId }).from(superAdmins).where(eq(superAdmins.userId, userId));
  return row !== undefined;
}

async function isApprovedPersonImpl(personId: string) {
  const [row] = await getDb()
    .select({ approvedAt: people.accountApprovedAt, userId: people.userId })
    .from(people)
    .where(eq(people.id, personId));
  return row !== undefined && row.userId !== null && row.approvedAt !== null;
}

async function submitAccessRequestImpl(input: { name: string; email: string; phone: string }) {
  const data = normalizeAccountData(input);
  await getDb()
    .insert(accessRequests)
    .values(data)
    .onConflictDoNothing();
}

async function submitGuestAccessRequestImpl(guestUserId: string, input: { email: string }) {
  const email = normalizeEmail(input.email);
  const [guest] = await getDb()
    .select({ name: people.displayName, phone: people.phone, accountApprovedAt: people.accountApprovedAt })
    .from(people)
    .where(eq(people.userId, guestUserId));
  if (!guest || guest.accountApprovedAt !== null) {
    throw new DomainError("guest_without_person", "Entre primeiro em um rolê para criar o cadastro.");
  }
  const created = await getDb()
    .insert(accessRequests)
    .values({ name: guest.name, email, phone: guest.phone, guestUserId })
    .onConflictDoNothing()
    .returning({ id: accessRequests.id });
  if (created.length === 0) {
    return;
  }

  const memberships = await getDb()
    .select({ outingId: outings.id, outingName: outings.name })
    .from(outingParticipants)
    .innerJoin(people, eq(people.id, outingParticipants.personId))
    .innerJoin(outings, eq(outings.id, outingParticipants.outingId))
    .where(and(eq(people.userId, guestUserId), isNotNull(outingParticipants.confirmedAt), isNull(outingParticipants.leftAt)));
  await Promise.all(
    memberships.map((membership) =>
      notifyOutingOwners(
        membership.outingId,
        guestRequestedAccount({ guestName: guest.name, outingId: membership.outingId, outingName: membership.outingName }),
      ),
    ),
  );
}

async function getGuestSummaryImpl(guestUserId: string) {
  const [guest] = await getDb()
    .select({ name: people.displayName, phone: people.phone, accountApprovedAt: people.accountApprovedAt })
    .from(people)
    .where(eq(people.userId, guestUserId));
  return guest && guest.accountApprovedAt === null ? { name: guest.name, phone: guest.phone } : null;
}

async function getGuestAccessRequestImpl(guestUserId: string) {
  const [latest] = await getDb()
    .select({ status: accessRequests.status })
    .from(accessRequests)
    .where(eq(accessRequests.guestUserId, guestUserId))
    .orderBy(desc(accessRequests.createdAt))
    .limit(1);
  return latest ?? null;
}

async function listAccessRequestsImpl() {
  return getDb().select().from(accessRequests).orderBy(desc(accessRequests.createdAt));
}

async function approveAccessRequestImpl(requestId: string, decidedBy: string) {
  const [request] = await getDb()
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")));
  if (!request) {
    throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
  }
  await provision(
    { name: request.name, email: request.email, phone: request.phone },
    async (tx, personId) => {
      const decided = await tx
        .update(accessRequests)
        .set({ status: "approved", personId, decidedBy, decidedAt: sql`now()` })
        .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")))
        .returning({ id: accessRequests.id });
      if (decided.length === 0) {
        throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
      }
    },
    request.guestUserId,
  );
}

async function rejectAccessRequestImpl(requestId: string, decidedBy: string, note: string) {
  const decided = await getDb()
    .update(accessRequests)
    .set({ status: "rejected", decidedBy, decidedAt: sql`now()`, decisionNote: note.trim() || null })
    .where(and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")))
    .returning({ id: accessRequests.id });
  if (decided.length === 0) {
    throw new DomainError("request_not_pending", "Este pedido já foi decidido.");
  }
}

async function createInviteImpl(createdBy: string) {
  const token = newToken();
  await getDb()
    .insert(accessInvites)
    .values({ tokenHash: hashToken(token), createdBy, expiresAt: inviteExpiry(new Date()) });
  return token;
}

async function listInvitesImpl() {
  return getDb()
    .select({
      id: accessInvites.id,
      createdAt: accessInvites.createdAt,
      expiresAt: accessInvites.expiresAt,
      usedAt: accessInvites.usedAt,
      revokedAt: accessInvites.revokedAt,
      createdByName: people.displayName,
    })
    .from(accessInvites)
    .innerJoin(people, eq(people.id, accessInvites.createdBy))
    .orderBy(desc(accessInvites.createdAt));
}

async function revokeInviteImpl(adminId: string, inviteId: string) {
  const revoked = await getDb()
    .update(accessInvites)
    .set({ revokedAt: sql`now()`, revokedBy: adminId })
    .where(and(eq(accessInvites.id, inviteId), isNull(accessInvites.usedAt), isNull(accessInvites.revokedAt)))
    .returning({ id: accessInvites.id });
  if (revoked.length === 0) {
    throw new DomainError("invite_not_revocable", "Este convite já foi usado ou revogado.");
  }
}

async function findUsableInvite(token: string) {
  const [invite] = await getDb()
    .select({ id: accessInvites.id, createdBy: accessInvites.createdBy })
    .from(accessInvites)
    .where(
      and(
        eq(accessInvites.tokenHash, hashToken(token)),
        isNull(accessInvites.usedAt),
        isNull(accessInvites.revokedAt),
        gt(accessInvites.expiresAt, sql`now()`),
      ),
    );
  return invite ?? null;
}

async function inviteIsUsableImpl(token: string) {
  return (await findUsableInvite(token)) !== null;
}

async function redeemInviteImpl(token: string, input: { name: string; email: string; phone: string }) {
  const data = normalizeAccountData(input);
  const invite = await findUsableInvite(token);
  if (!invite) {
    throw new DomainError("invite_unavailable", "Este convite não vale mais. Peça outro a quem te convidou.");
  }
  await provision(data, async (tx, personId) => {
    const used = await tx
      .update(accessInvites)
      .set({ usedAt: sql`now()` })
      .where(and(eq(accessInvites.id, invite.id), isNull(accessInvites.usedAt), isNull(accessInvites.revokedAt), gt(accessInvites.expiresAt, sql`now()`)))
      .returning({ id: accessInvites.id });
    if (used.length === 0) {
      throw new DomainError("invite_unavailable", "Este convite não vale mais. Peça outro a quem te convidou.");
    }
    const [request] = await tx
      .insert(accessRequests)
      .values({
        ...data,
        source: "invite",
        status: "approved",
        personId,
        decidedBy: invite.createdBy,
        decidedAt: sql`now()`,
      })
      .returning({ id: accessRequests.id });
    await tx.update(accessInvites).set({ requestId: request.id }).where(eq(accessInvites.id, invite.id));
  });
}

async function listAccountsImpl() {
  return getDb()
    .select({ id: people.id, displayName: people.displayName, phone: people.phone, approvedAt: people.accountApprovedAt })
    .from(people)
    .where(and(isNotNull(people.userId), isNotNull(people.accountApprovedAt)))
    .orderBy(desc(people.accountApprovedAt));
}

export const isSuperAdmin = (...args: Parameters<typeof isSuperAdminImpl>) => asService(() => isSuperAdminImpl(...args));
export const isApprovedPerson = (...args: Parameters<typeof isApprovedPersonImpl>) => asService(() => isApprovedPersonImpl(...args));
export const submitAccessRequest = (...args: Parameters<typeof submitAccessRequestImpl>) => asService(() => submitAccessRequestImpl(...args));
export const submitGuestAccessRequest = (...args: Parameters<typeof submitGuestAccessRequestImpl>) => asService(() => submitGuestAccessRequestImpl(...args));
export const getGuestSummary = (...args: Parameters<typeof getGuestSummaryImpl>) => asService(() => getGuestSummaryImpl(...args));
export const getGuestAccessRequest = (...args: Parameters<typeof getGuestAccessRequestImpl>) => asService(() => getGuestAccessRequestImpl(...args));
export const listAccessRequests = () => asService(listAccessRequestsImpl);
export const approveAccessRequest = (...args: Parameters<typeof approveAccessRequestImpl>) => asService(() => approveAccessRequestImpl(...args));
export const rejectAccessRequest = (...args: Parameters<typeof rejectAccessRequestImpl>) => asService(() => rejectAccessRequestImpl(...args));
export const createInvite = (...args: Parameters<typeof createInviteImpl>) => asService(() => createInviteImpl(...args));
export const revokeInvite = (...args: Parameters<typeof revokeInviteImpl>) => asService(() => revokeInviteImpl(...args));
export const listInvites = () => asService(listInvitesImpl);
export const inviteIsUsable = (...args: Parameters<typeof inviteIsUsableImpl>) => asService(() => inviteIsUsableImpl(...args));
export const redeemInvite = (...args: Parameters<typeof redeemInviteImpl>) => asService(() => redeemInviteImpl(...args));
export const listAccounts = () => asService(listAccountsImpl);
