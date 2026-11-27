import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/db/schema";

export async function createTestDatabase() {
  const client = new PGlite();
  await client.exec("create schema auth; create table auth.users (id uuid primary key, email text);");
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}

type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

export async function seedOuting(db: TestDatabase, phones: [string, string] = ["+5511999990001", "+5511999990002"]) {
  const [lucas, maria] = await db
    .insert(schema.people)
    .values([
      { displayName: "Lucas", phone: phones[0] },
      { displayName: "Maria", phone: phones[1] },
    ])
    .returning();
  const [outing] = await db
    .insert(schema.outings)
    .values({ name: "Churrasco de sábado", kind: "event", createdBy: lucas.id })
    .returning();
  await db.insert(schema.outingParticipants).values([
    { outingId: outing.id, personId: lucas.id, displayName: "Lucas", role: "admin" },
    { outingId: outing.id, personId: maria.id, displayName: "Maria", role: "member" },
  ]);
  return { outing, lucas, maria };
}

export async function approveAccount(db: TestDatabase, personId: string) {
  const userId = crypto.randomUUID();
  await db.execute(sql`insert into auth.users (id, email) values (${userId}, ${`${userId}@teste.local`})`);
  await db.update(schema.people).set({ userId, accountApprovedAt: new Date() }).where(eq(schema.people.id, personId));
  return userId;
}
