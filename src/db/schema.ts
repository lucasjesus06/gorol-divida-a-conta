import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { authUsers } from "drizzle-orm/supabase";
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
    role: text("role", { enum: outingRoles }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("outing_participants_role_valid", oneOf(table.role, outingRoles)),
    uniqueIndex("outing_participants_outing_person_idx").on(table.outingId, table.personId),
    uniqueIndex("outing_participants_one_admin_idx")
      .on(table.outingId)
      .where(sql`${table.role} = 'admin'`),
    index("outing_participants_person_idx").on(table.personId),
  ],
).enableRLS();
