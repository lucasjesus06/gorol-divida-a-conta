import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
import { accessRequestSources, accessRequestStatuses } from "../domain/access";
import { billStatuses, leftoverModes } from "../domain/bill-status";
import { approvalDecisions, disputeStatuses, disputeSubjects } from "../domain/dispute-status";
import { expenseSplitMethods, expenseStatuses } from "../domain/expense-status";
import { confirmationSources, paymentStatuses } from "../domain/payment-status";
import { payerRequestStatuses } from "../domain/payer-request";
import { joinRequestStatuses } from "../domain/join";
import { outingKinds, outingRoles, outingStatuses } from "../domain/outing";
import { notificationKinds } from "../domain/notification-kinds";
import { reminderChannels } from "../domain/reminder-channels";
import { closingVoteDecisions, closingVoteStatuses } from "../domain/closing-vote-status";
import { fileKinds, fileStatuses } from "../domain/file-kinds";
import { pixKeyTypes } from "../domain/pix-key-types";

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
    /** How the person likes to be called in reminders; empty means the first name. */
    nickname: text("nickname"),
    pixKey: text("pix_key"),
    pixKeyType: text("pix_key_type", { enum: pixKeyTypes }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("people_pix_key_type_valid", sql`${table.pixKeyType} is null or ${oneOf(table.pixKeyType, pixKeyTypes)}`),
    check("people_nickname_size", sql`${table.nickname} is null or length(btrim(${table.nickname})) between 1 and 40`),
    check(
      "people_pix_key_complete",
      sql`(${table.pixKey} is null) = (${table.pixKeyType} is null)`,
    ),
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
    closedBy: uuid("closed_by").references(() => people.id, { onDelete: "restrict" }),
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
    /** Set when the person left or was removed; the row stays so names in past expenses still resolve. */
    leftAt: timestamp("left_at", { withTimezone: true }),
    leftBy: uuid("left_by").references(() => people.id, { onDelete: "restrict" }),
  },
  (table) => [
    check("outing_participants_left_matches", sql`(${table.leftAt} is null) = (${table.leftBy} is null)`),
    check("outing_participants_owner_stays", sql`${table.leftAt} is null or ${table.role} <> 'admin'`),
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
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => people.id, { onDelete: "set null" }),
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

export const expenseDisputes = pgTable(
  "expense_disputes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "restrict" }),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    subject: text("subject", { enum: disputeSubjects }).notNull(),
    message: text("message").notNull(),
    status: text("status", { enum: disputeStatuses }).notNull().default("open"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    resultExpenseId: uuid("result_expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("expense_disputes_subject_valid", oneOf(table.subject, disputeSubjects)),
    check("expense_disputes_status_valid", oneOf(table.status, disputeStatuses)),
    check("expense_disputes_message_filled", sql`length(btrim(${table.message})) > 0`),
    check("expense_disputes_decided_matches_status", sql`(${table.status} = 'open') = (${table.decidedAt} is null)`),
    uniqueIndex("expense_disputes_one_open_per_person_idx")
      .on(table.expenseId, table.openedBy)
      .where(sql`${table.status} = 'open'`),
    index("expense_disputes_outing_idx").on(table.outingId, table.status),
  ],
).enableRLS();

export const expenseDisputeApprovals = pgTable(
  "expense_dispute_approvals",
  {
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => expenseDisputes.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    decision: text("decision", { enum: approvalDecisions }).notNull().default("pending"),
    note: text("note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.disputeId, table.personId] }),
    check("expense_dispute_approvals_decision_valid", oneOf(table.decision, approvalDecisions)),
    check("expense_dispute_approvals_decided_matches", sql`(${table.decision} = 'pending') = (${table.decidedAt} is null)`),
  ],
).enableRLS();

export const consumptionBills = pgTable(
  "consumption_bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    description: text("description").notNull(),
    status: text("status", { enum: billStatuses }).notNull().default("open"),
    openedBy: uuid("opened_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    serviceChargeCents: bigint("service_charge_cents", { mode: "number" }).notNull().default(0),
    discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
    leftoverMode: text("leftover_mode", { enum: leftoverModes }),
    leftoverTo: uuid("leftover_to").references(() => people.id, { onDelete: "restrict" }),
    resultExpenseId: uuid("result_expense_id").references(() => expenses.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    check("consumption_bills_status_valid", oneOf(table.status, billStatuses)),
    check("consumption_bills_leftover_mode_valid", sql`${table.leftoverMode} is null or ${table.leftoverMode} in ('spread', 'transfer')`),
    check("consumption_bills_description_filled", sql`length(btrim(${table.description})) > 0`),
    check("consumption_bills_amounts_non_negative", sql`${table.serviceChargeCents} >= 0 and ${table.discountCents} >= 0`),
    check("consumption_bills_closed_matches_status", sql`(${table.status} = 'closed') = (${table.closedAt} is not null)`),
    check("consumption_bills_transfer_has_target", sql`(${table.leftoverMode} = 'transfer') = (${table.leftoverTo} is not null)`),
    uniqueIndex("consumption_bills_idempotency_idx")
      .on(table.outingId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("consumption_bills_outing_idx").on(table.outingId, table.status),
  ],
).enableRLS();

export const billPayers = pgTable(
  "bill_payers",
  {
    billId: uuid("bill_id")
      .notNull()
      .references(() => consumptionBills.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.billId, table.personId] }), check("bill_payers_amount_positive", sql`${table.amountCents} > 0`)],
).enableRLS();

export const billItems = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => consumptionBills.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    totalCents: bigint("total_cents", { mode: "number" }).notNull(),
    quantityNum: bigint("quantity_num", { mode: "number" }).notNull(),
    quantityDen: bigint("quantity_den", { mode: "number" }).notNull(),
  },
  (table) => [
    check("bill_items_total_positive", sql`${table.totalCents} > 0`),
    check("bill_items_quantity_positive", sql`${table.quantityNum} > 0 and ${table.quantityDen} > 0`),
    check("bill_items_description_filled", sql`length(btrim(${table.description})) > 0`),
    uniqueIndex("bill_items_position_idx").on(table.billId, table.position),
  ],
).enableRLS();

export const billClaims = pgTable(
  "bill_claims",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => billItems.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    quantityNum: bigint("quantity_num", { mode: "number" }).notNull(),
    quantityDen: bigint("quantity_den", { mode: "number" }).notNull(),
    markedBy: uuid("marked_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.personId] }),
    check("bill_claims_quantity_positive", sql`${table.quantityNum} > 0 and ${table.quantityDen} > 0`),
  ],
).enableRLS();

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    fromId: uuid("from_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    toId: uuid("to_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    onBehalfOfId: uuid("on_behalf_of_id").references(() => people.id, { onDelete: "restrict" }),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    status: text("status", { enum: paymentStatuses }).notNull().default("declared"),
    confirmedBy: text("confirmed_by", { enum: confirmationSources }),
    declaredAt: timestamp("declared_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    check("payments_status_valid", oneOf(table.status, paymentStatuses)),
    check("payments_confirmed_by_valid", sql`${table.confirmedBy} is null or ${table.confirmedBy} in ('creditor', 'receipt')`),
    check("payments_amount_positive", sql`${table.amountCents} > 0`),
    check("payments_different_people", sql`${table.fromId} <> ${table.toId} and (${table.onBehalfOfId} is null or (${table.onBehalfOfId} <> ${table.fromId} and ${table.onBehalfOfId} <> ${table.toId}))`),
    check("payments_resolved_matches_status", sql`(${table.status} = 'declared') = (${table.resolvedAt} is null)`),
    check("payments_confirmed_has_source", sql`(${table.status} = 'confirmed') = (${table.confirmedBy} is not null)`),
    uniqueIndex("payments_idempotency_idx")
      .on(table.outingId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    index("payments_outing_idx").on(table.outingId, table.status),
  ],
).enableRLS();

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: notificationKinds }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("notifications_kind_valid", oneOf(table.kind, notificationKinds)),
    check("notifications_url_internal", sql`${table.url} ~ '^/[^/]'  or ${table.url} = '/'`),
    index("notifications_person_idx").on(table.personId, table.createdAt),
  ],
).enableRLS();

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("push_subscriptions_person_idx").on(table.personId)],
).enableRLS();

export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    creditorId: uuid("creditor_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    channel: text("channel", { enum: reminderChannels }).notNull(),
    sentBy: uuid("sent_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("reminder_log_channel_valid", oneOf(table.channel, reminderChannels)),
    check("reminder_log_sequence_positive", sql`${table.sequence} > 0`),
    check("reminder_log_different_people", sql`${table.debtorId} <> ${table.creditorId}`),
    index("reminder_log_pair_idx").on(table.debtorId, table.creditorId, table.sentAt),
  ],
).enableRLS();

export const reminderPauses = pgTable(
  "reminder_pauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    debtorId: uuid("debtor_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    creditorId: uuid("creditor_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    pausedAt: timestamp("paused_at", { withTimezone: true }).notNull().defaultNow(),
    pausedUntil: timestamp("paused_until", { withTimezone: true }).notNull(),
    registeredBy: uuid("registered_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
  },
  (table) => [
    check("reminder_pauses_after_start", sql`${table.pausedUntil} > ${table.pausedAt}`),
    index("reminder_pauses_pair_idx").on(table.debtorId, table.creditorId),
  ],
).enableRLS();

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    position: integer("position").notNull().unique(),
    body: text("body").notNull(),
    updatedBy: uuid("updated_by").references(() => people.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("message_templates_body_size", sql`length(btrim(${table.body})) between 1 and 600`),
    check("message_templates_position_positive", sql`${table.position} > 0`),
  ],
).enableRLS();

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: fileKinds }).notNull(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    outingId: uuid("outing_id").references(() => outings.id, { onDelete: "restrict" }),
    /** The expense (evidence) or payment (receipt) the file belongs to; empty for profile photos. */
    subjectId: uuid("subject_id"),
    path: text("path").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    originalName: text("original_name").notNull(),
    status: text("status", { enum: fileStatuses }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("files_kind_valid", oneOf(table.kind, fileKinds)),
    check("files_status_valid", oneOf(table.status, fileStatuses)),
    check("files_size_positive", sql`${table.sizeBytes} > 0`),
    check("files_name_size", sql`length(btrim(${table.originalName})) between 1 and 200`),
    check(
      "files_subject_matches_kind",
      sql`(${table.kind} = 'profile_photo' and ${table.outingId} is null and ${table.subjectId} is null)
        or (${table.kind} <> 'profile_photo' and ${table.outingId} is not null and ${table.subjectId} is not null)`,
    ),
    index("files_subject_idx").on(table.kind, table.subjectId),
    index("files_owner_idx").on(table.ownerId, table.kind),
  ],
).enableRLS();

export const closingVotes = pgTable(
  "closing_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    /** The balances the voters saw; if they change, the vote no longer means what people agreed to. */
    snapshot: text("snapshot").notNull(),
    status: text("status", { enum: closingVoteStatuses }).notNull().default("open"),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("closing_votes_status_valid", oneOf(table.status, closingVoteStatuses)),
    check("closing_votes_resolved_matches_status", sql`(${table.status} = 'open') = (${table.resolvedAt} is null)`),
    uniqueIndex("closing_votes_one_open_per_outing_idx").on(table.outingId).where(sql`${table.status} = 'open'`),
    index("closing_votes_outing_idx").on(table.outingId, table.createdAt),
  ],
).enableRLS();

export const closingVoteChoices = pgTable(
  "closing_vote_choices",
  {
    voteId: uuid("vote_id")
      .notNull()
      .references(() => closingVotes.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    decision: text("decision", { enum: closingVoteDecisions }).notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.voteId, table.personId] }),
    check("closing_vote_choices_decision_valid", oneOf(table.decision, closingVoteDecisions)),
    check("closing_vote_choices_decided_matches", sql`(${table.decision} = 'pending') = (${table.decidedAt} is null)`),
  ],
).enableRLS();

export const outingReopenings = pgTable(
  "outing_reopenings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outingId: uuid("outing_id")
      .notNull()
      .references(() => outings.id, { onDelete: "restrict" }),
    /** The late dispute that made the outing open again. */
    disputeId: uuid("dispute_id")
      .notNull()
      .references(() => expenseDisputes.id, { onDelete: "restrict" }),
    reopenedBy: uuid("reopened_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    reopenedAt: timestamp("reopened_at", { withTimezone: true }).notNull().defaultNow(),
    previousClosedAt: timestamp("previous_closed_at", { withTimezone: true }).notNull(),
    previousClosedBy: uuid("previous_closed_by").references(() => people.id, { onDelete: "restrict" }),
  },
  (table) => [index("outing_reopenings_outing_idx").on(table.outingId, table.reopenedAt)],
).enableRLS();

export const termsAcceptances = pgTable(
  "terms_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    /** Which text of the terms the person agreed to. */
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
    /** Agreement to receive payment reminders, given together with the terms and withdrawable later. */
    remindersConsent: boolean("reminders_consent").notNull(),
    remindersWithdrawnAt: timestamp("reminders_withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    check("terms_acceptances_version_filled", sql`length(btrim(${table.version})) > 0`),
    check("terms_acceptances_withdrawn_needs_consent", sql`${table.remindersWithdrawnAt} is null or ${table.remindersConsent}`),
    uniqueIndex("terms_acceptances_person_version_idx").on(table.personId, table.version),
  ],
).enableRLS();

export const systemParameters = pgTable("system_parameters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => people.id, { onDelete: "restrict" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const systemParameterChanges = pgTable(
  "system_parameter_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    /** The value that was in force before, whether it was the default or an earlier change. */
    previousValue: integer("previous_value").notNull(),
    newValue: integer("new_value").notNull(),
    /** True when the change put the default value back. */
    reset: boolean("reset").notNull().default(false),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("system_parameter_changes_key_idx").on(table.key, table.changedAt)],
).enableRLS();

/** What the owner chose for one outing. A missing value means "use the system default". */
export const outingSettings = pgTable(
  "outing_settings",
  {
    outingId: uuid("outing_id")
      .primaryKey()
      .references(() => outings.id, { onDelete: "cascade" }),
    voteDays: integer("vote_days"),
    disputeWindowDays: integer("dispute_window_days"),
    defaultSplit: text("default_split"),
    suggestedRoute: text("suggested_route"),
    serviceFeePercent: integer("service_fee_percent"),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("outing_settings_vote_days_range", sql`${table.voteDays} is null or ${table.voteDays} between 1 and 14`),
    check("outing_settings_dispute_days_range", sql`${table.disputeWindowDays} is null or ${table.disputeWindowDays} between 1 and 60`),
    check("outing_settings_default_split_valid", sql`${table.defaultSplit} is null or ${table.defaultSplit} in ('equal', 'exact')`),
    check("outing_settings_suggested_route_valid", sql`${table.suggestedRoute} is null or ${table.suggestedRoute} in ('smart', 'manual')`),
    check("outing_settings_service_fee_valid", sql`${table.serviceFeePercent} is null or ${table.serviceFeePercent} in (0, 10, 13)`),
  ],
).enableRLS();
