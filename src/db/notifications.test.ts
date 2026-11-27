import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { notifications, pushSubscriptions } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let lucas: string;
let maria: string;
let noticeId: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900600001", "+5511900600002"]);
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [row] = await db
    .insert(notifications)
    .values({ personId: lucas, kind: "payment_declared", title: "Pagamento", body: "Maria pagou", url: "/roles/1" })
    .returning({ id: notifications.id });
  noticeId = row.id;
});

describe("avisos", () => {
  it("cada pessoa vê só os próprios avisos", async () => {
    expect(await as(lucas, (tx) => tx.$count(notifications))).toBe(1);
    expect(await as(maria, (tx) => tx.$count(notifications))).toBe(0);
  });

  it("ninguém cria aviso pelo acesso do usuário, nem para si", async () => {
    await expect(
      as(lucas, (tx) => tx.insert(notifications).values({ personId: lucas, kind: "join_requested", title: "x", body: "y", url: "/" })),
    ).rejects.toThrow();
  });

  it("marca como lido só o próprio aviso e só a data de leitura, uma vez", async () => {
    await as(maria, (tx) => tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, noticeId)));
    expect((await db.select().from(notifications))[0].readAt).toBeNull();

    await expect(as(lucas, (tx) => tx.update(notifications).set({ title: "outro" }).where(eq(notifications.id, noticeId)))).rejects.toThrow();
    await as(lucas, (tx) => tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, noticeId)));
    expect((await db.select().from(notifications))[0].readAt).not.toBeNull();
    await expect(as(lucas, (tx) => tx.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, noticeId)))).rejects.toThrow();
  });

  it("recusa endereço de fora do app", async () => {
    await expect(
      db.insert(notifications).values({ personId: lucas, kind: "join_requested", title: "x", body: "y", url: "//evil.example" }),
    ).rejects.toThrow();
  });
});

describe("inscrições de push", () => {
  const keys = { p256dh: "p", auth: "a" };

  it("a pessoa inscreve e remove o próprio aparelho, e não vê os dos outros", async () => {
    await as(lucas, (tx) => tx.insert(pushSubscriptions).values({ personId: lucas, endpoint: "https://push.example/1", ...keys }));
    expect(await as(maria, (tx) => tx.$count(pushSubscriptions))).toBe(0);
    await as(maria, (tx) => tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, "https://push.example/1")));
    expect(await db.$count(pushSubscriptions)).toBe(1);
    await as(lucas, (tx) => tx.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, "https://push.example/1")));
    expect(await db.$count(pushSubscriptions)).toBe(0);
  });

  it("não inscreve aparelho em nome de outra pessoa", async () => {
    await expect(
      as(lucas, (tx) => tx.insert(pushSubscriptions).values({ personId: maria, endpoint: "https://push.example/2", ...keys })),
    ).rejects.toThrow();
  });
});
