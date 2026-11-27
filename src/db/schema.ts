import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { accessRequestSources, accessRequestStatuses } from "../domain/access";
import { expenseSplitMethods, expenseStatuses } from "../domain/expense-status";
import { payerRequestStatuses } from "../domain/payer-request";
import { joinRequestStatuses } from "../domain/join";
import { outingKinds, outingRoles, outingStatuses } from "../domain/outing";

const oneOf = (column: AnyPgColumn, values: readonly string[]) =>
  sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(", "))})`;

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    displayName: text("display_name").notNull(),
    phone: text("phone").notNull().unique(),
    userId: uuid("user_id")
      .unique()
      .references(() => authUsers.id, { onDelete: "set null" }),
    accountApprovedAt: timestamp("account_approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("people_phone_e164", sql`${table.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check("people_display_name_filled", sql`length(btrim(${table.displayName})) > 0`),
  ],
).enableRLS();

export const outings = pgTable(
  "outings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    kind: text("kind", { enum: outingKinds }).notNull(),
    status: text("status", { enum: outingStatuses }).notNull().default("active"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    check("outings_kind_valid", oneOf(table.kind, outingKinds)),
    check("outings_status_valid", oneOf(table.status, outingStatuses)),
    check("outings_name_filled", sql`length(btrim(${table.name})) > 0`),
    check("outings_closed_at_matches_status", sql`(${table.status} = 'closed') = (${table.closedAt} is not null)`),
  ],
).enableRLS();

export const outingParticipants = pgTable(
  "outing_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: outingRoles }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    check("outing_participants_role_valid", oneOf(table.role, outingRoles)),
    check("outing_participants_display_name_filled", sql`length(btrim(${table.displayName})) > 0`),
    uniqueIndex("outing_participants_outing_name_idx").on(table.outingId, sql`lower(${table.displayName})`),
    uniqueIndex("outing_participants_outing_person_idx").on(table.outingId, table.personId),
    uniqueIndex("outing_participants_one_admin_idx")
      .on(table.outingId)
      .where(sql`${table.role} = 'admin'`),
    index("outing_participants_person_idx").on(table.personId),
  ],
).enableRLS();

export const superAdmins = pgTable("super_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    source: text("source", { enum: accessRequestSources }).notNull().default("request"),
    status: text("status", { enum: accessRequestStatuses }).notNull().default("pending"),
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    guestUserId: uuid("guest_user_id").references(() => authUsers.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => people.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("access_requests_one_pending_per_email_idx")
      .on(table.email)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("access_requests_one_pending_per_guest_idx")
      .on(table.guestUserId)
      .where(sql`${table.status} = 'pending' and ${table.guestUserId} is not null`),
    index("access_requests_status_idx").on(table.status, table.createdAt),
    check("access_requests_source_valid", oneOf(table.source, accessRequestSources)),
    check("access_requests_status_valid", oneOf(table.status, accessRequestStatuses)),
    check("access_requests_phone_e164", sql`${table.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
    check("access_requests_email_shape", sql`${table.email} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' and length(${table.email}) <= 254 and ${table.email} = lower(${table.email})`),
    check("access_requests_name_filled", sql`length(btrim(${table.name})) > 0`),
    check("access_requests_decided_matches_status", sql`(${table.status} = 'pending') = (${table.decidedAt} is null)`),
  ],
).enableRLS();

export const accessInvites = pgTable(
  "access_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    requestId: uuid("request_id").references(() => accessRequests.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("access_invites_token_hash_shape", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`)],
).enableRLS();

export const outingJoinLinks = pgTable(
  "outing_join_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("outing_join_links_token_hash_shape", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex("outing_join_links_one_active_idx")
      .on(table.outingId)
      .where(sql`${table.revokedAt} is null`),
  ],
).enableRLS();

export const outingJoinRequests = pgTable(
  "outing_join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => outingParticipants.id, { onDelete: "cascade" }),
    guestUserId: uuid("guest_user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    status: text("status", { enum: joinRequestStatuses }).notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => people.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("outing_join_requests_status_valid", oneOf(table.status, joinRequestStatuses)),
    check("outing_join_requests_decided_matches_status", sql`(${table.status} = 'pending') = (${table.decidedAt} is null)`),
    uniqueIndex("outing_join_requests_one_pending_per_participant_idx")
      .on(table.participantId)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex("outing_join_requests_one_pending_per_guest_idx")
      .on(table.outingId, table.guestUserId)
      .where(sql`${table.status} = 'pending'`),
  ],
).enableRLS();

export const outingJoinAttempts = pgTable(
  "outing_join_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => outingParticipants.id, { onDelete: "cascade" }),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("outing_join_attempts_outing_idx").on(table.outingId, table.createdAt)],
).enableRLS();

export const outingPayers = pgTable(
  "outing_payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    declaredBy: uuid("declared_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("outing_payers_outing_person_idx").on(table.outingId, table.personId)],
).enableRLS();

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    version: integer("version").notNull().default(1),
    previousVersionId: uuid("previous_version_id").references((): AnyPgColumn => expenses.id, { onDelete: "restrict" }),
    status: text("status", { enum: expenseStatuses }).notNull().default("active"),
    description: text("description").notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    splitMethod: text("split_method", { enum: expenseSplitMethods }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    registeredBy: uuid("registered_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    voidedBy: uuid("voided_by").references(() => people.id, { onDelete: "restrict" }),
    voidReason: text("void_reason"),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    check("expenses_status_valid", oneOf(table.status, expenseStatuses)),
    check("expenses_split_method_valid", oneOf(table.splitMethod, expenseSplitMethods)),
    check("expenses_total_positive", sql`${table.totalCents} > 0`),
    check("expenses_version_positive", sql`${table.version} >= 1`),
    check("expenses_description_filled", sql`length(btrim(${table.description})) > 0`),
    check(
      "expenses_voided_matches_status",
      sql`(${table.status} = 'voided') = (${table.voidedBy} is not null and ${table.voidReason} is not null)`,
    ),
    uniqueIndex("expenses_idempotency_idx")
      .on(table.outingId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("expenses_one_revision_per_version_idx")
      .on(table.previousVersionId)
      .where(sql`${table.previousVersionId} is not null`),
    index("expenses_outing_idx").on(table.outingId, table.occurredAt),
  ],
).enableRLS();

export const expensePayers = pgTable(
  "expense_payers",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.personId] }),
    check("expense_payers_amount_positive", sql`${table.amountCents} > 0`),
  ],
).enableRLS();

export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.expenseId, table.personId] }),
    check("expense_shares_amount_non_negative", sql`${table.amountCents} >= 0`),
  ],
).enableRLS();

export const payerRequests = pgTable(
  "payer_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    targetExpenseId: uuid("target_expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    splitMethod: text("split_method", { enum: expenseSplitMethods }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: payerRequestStatuses }).notNull().default("pending"),
    decidedBy: uuid("decided_by").references(() => people.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    resultExpenseId: uuid("result_expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("payer_requests_status_valid", oneOf(table.status, payerRequestStatuses)),
    check("payer_requests_split_method_valid", oneOf(table.splitMethod, expenseSplitMethods)),
    check("payer_requests_total_positive", sql`${table.totalCents} > 0`),
    check("payer_requests_description_filled", sql`length(btrim(${table.description})) > 0`),
    check("payer_requests_decided_matches_status", sql`(${table.status} = 'pending') = (${table.decidedAt} is null)`),
    check("payer_requests_result_only_when_approved", sql`${table.resultExpenseId} is null or ${table.status} = 'approved'`),
    uniqueIndex("payer_requests_idempotency_idx")
      .on(table.outingId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("payer_requests_one_pending_per_target_idx")
      .on(table.requestedBy, table.targetExpenseId)
      .where(sql`${table.status} = 'pending' and ${table.targetExpenseId} is not null`),
    index("payer_requests_outing_idx").on(table.outingId, table.status),
  ],
).enableRLS();

export const payerRequestPayers = pgTable(
  "payer_request_payers",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => payerRequests.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.personId] }), check("payer_request_payers_amount_positive", sql`${table.amountCents} > 0`)],
).enableRLS();

export const payerRequestShares = pgTable(
  "payer_request_shares",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => payerRequests.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.requestId, table.personId] }), check("payer_request_shares_amount_non_negative", sql`${table.amountCents} >= 0`)],
).enableRLS();
