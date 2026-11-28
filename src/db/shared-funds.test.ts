import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { people, sharedFunds } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let ids: string[];
let guest: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

async function expectRejectedWith(promise: Promise<unknown>, reason: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught as { message: string; cause?: { message: string } },
  );
  expect(error, "deveria ter sido recusado").not.toBeNull();
  expect(`${error?.message} ${error?.cause?.message ?? ""}`).toContain(reason);
}

const pair = (x: string, y: string) => (x < y ? { personA: x, personB: y } : { personA: y, personB: x });
const request = (by: string, other: string) => as(by, (tx) => tx.insert(sharedFunds).values({ ...pair(by, other), requestedBy: by }).returning());

beforeAll(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(people)
    .values([1, 2, 3, 4, 5, 6].map((n) => ({ displayName: `P${n}`, phone: `+551190070000${n}` })))
    .returning();
  ids = rows.map((row) => row.id);
  for (const id of ids.slice(0, 5)) {
    await approveAccount(db, id);
  }
  guest = ids[5] as string;
});

describe("pedir", () => {
  it("quem pede vê o pedido, o outro também, e um terceiro não", async () => {
    const [fund] = await request(ids[0] as string, ids[1] as string);
    expect(fund).toMatchObject({ status: "pending", requestedBy: ids[0] });
    expect(await as(ids[1] as string, (tx) => tx.select().from(sharedFunds))).toHaveLength(1);
    expect(await as(ids[2] as string, (tx) => tx.select().from(sharedFunds))).toEqual([]);
  });

  it("não se pede em nome de outra pessoa", async () => {
    await expectRejectedWith(
      as(ids[2] as string, (tx) => tx.insert(sharedFunds).values({ ...pair(ids[3] as string, ids[4] as string), requestedBy: ids[3] as string })),
      "row-level security",
    );
  });

  it("só contas fazem parte: convidado fica de fora", async () => {
    await expectRejectedWith(request(ids[2] as string, guest), "shared_fund_needs_accounts");
  });

  it("ninguém entra em dois ao mesmo tempo, nem com pedido pendente", async () => {
    await expectRejectedWith(request(ids[1] as string, ids[2] as string), "shared_fund_person_already_in_one");
    await expectRejectedWith(request(ids[2] as string, ids[0] as string), "shared_fund_person_already_in_one");
  });
});

describe("responder e desfazer", () => {
  it("só o outro aceita; quem pediu não aceita o próprio pedido", async () => {
    const [fund] = await as(ids[0] as string, (tx) => tx.select().from(sharedFunds));
    await expectRejectedWith(
      as(ids[0] as string, (tx) => tx.update(sharedFunds).set({ status: "active", acceptedAt: new Date() }).where(eq(sharedFunds.id, fund.id))),
      "shared_fund_only_the_other_answers",
    );
    await as(ids[1] as string, (tx) => tx.update(sharedFunds).set({ status: "active", acceptedAt: new Date() }).where(eq(sharedFunds.id, fund.id)));
    expect((await db.select().from(sharedFunds).where(eq(sharedFunds.id, fund.id)))[0]?.status).toBe("active");
  });

  it("um terceiro não mexe no vínculo dos outros", async () => {
    const [fund] = await db.select().from(sharedFunds);
    const changed = await as(ids[2] as string, (tx) => tx.update(sharedFunds).set({ status: "ended", endedAt: new Date(), endedBy: ids[2] as string }).where(eq(sharedFunds.id, fund.id)).returning());
    expect(changed).toEqual([]);
  });

  it("qualquer um dos dois desfaz, e o vínculo não muda de pessoas nem se apaga", async () => {
    const [fund] = await db.select().from(sharedFunds);
    await expectRejectedWith(db.update(sharedFunds).set({ personA: ids[4] as string }).where(eq(sharedFunds.id, fund.id)), "shared_fund_is_immutable");
    await expectRejectedWith(db.delete(sharedFunds).where(eq(sharedFunds.id, fund.id)), "financial_history_is_immutable");
    await as(ids[0] as string, (tx) => tx.update(sharedFunds).set({ status: "ended", endedAt: new Date(), endedBy: ids[0] as string }).where(eq(sharedFunds.id, fund.id)));
    const [ended] = await db.select().from(sharedFunds).where(eq(sharedFunds.id, fund.id));
    expect(ended).toMatchObject({ status: "ended", endedBy: ids[0] });
    await expectRejectedWith(db.update(sharedFunds).set({ status: "active" }).where(eq(sharedFunds.id, fund.id)), "shared_fund_status_change_invalid");
  });

  it("depois de desfeito as duas pessoas podem entrar em outro vínculo", async () => {
    const [fund] = await request(ids[0] as string, ids[2] as string);
    expect(fund?.status).toBe("pending");
  });

  it("recusar mantém o pedido guardado como recusado, sem datas", async () => {
    const [fund] = await request(ids[3] as string, ids[4] as string);
    await as(ids[4] as string, (tx) => tx.update(sharedFunds).set({ status: "declined" }).where(eq(sharedFunds.id, fund.id)));
    expect((await db.select().from(sharedFunds).where(eq(sharedFunds.id, fund.id)))[0]).toMatchObject({ status: "declined", acceptedAt: null });
    await expectRejectedWith(
      db.update(sharedFunds).set({ status: "active", acceptedAt: new Date() }).where(eq(sharedFunds.id, fund.id)),
      "shared_fund_status_change_invalid",
    );
  });
});
