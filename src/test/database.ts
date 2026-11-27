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

export async function insertExpense(
  db: TestDatabase,
  input: {
    outingId: string;
    registeredBy: string;
    totalCents: number;
    payers: Record<string, number>;
    shares: Record<string, number>;
    description?: string;
    splitMethod?: "equal" | "exact";
    version?: number;
    previousVersionId?: string;
  },
) {
  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        outingId: input.outingId,
        registeredBy: input.registeredBy,
        totalCents: input.totalCents,
        description: input.description ?? "Despesa",
        splitMethod: input.splitMethod ?? "exact",
        occurredAt: new Date(),
        version: input.version ?? 1,
        previousVersionId: input.previousVersionId,
      })
      .returning();
    await tx.insert(schema.expensePayers).values(Object.entries(input.payers).map(([personId, amountCents]) => ({ expenseId: expense.id, personId, amountCents })));
    await tx.insert(schema.expenseShares).values(Object.entries(input.shares).map(([personId, amountCents]) => ({ expenseId: expense.id, personId, amountCents })));
    return expense;
  });
}

export async function insertBill(
  db: TestDatabase,
  input: {
    outingId: string;
    openedBy: string;
    payers: Record<string, number>;
    items: { description: string; totalCents: number; num?: number; den?: number }[];
    serviceChargeCents?: number;
    discountCents?: number;
  },
) {
  return db.transaction(async (tx) => {
    const [bill] = await tx
      .insert(schema.consumptionBills)
      .values({
        outingId: input.outingId,
        openedBy: input.openedBy,
        description: "Bar do Zé",
        occurredAt: new Date(),
        serviceChargeCents: input.serviceChargeCents ?? 0,
        discountCents: input.discountCents ?? 0,
      })
      .returning();
    await tx.insert(schema.billPayers).values(Object.entries(input.payers).map(([personId, amountCents]) => ({ billId: bill.id, personId, amountCents })));
    const items = await tx
      .insert(schema.billItems)
      .values(
        input.items.map((item, position) => ({
          billId: bill.id,
          position,
          description: item.description,
          totalCents: item.totalCents,
          quantityNum: item.num ?? 1,
          quantityDen: item.den ?? 1,
        })),
      )
      .returning();
    return { bill, items };
  });
}
