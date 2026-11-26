import { beforeAll, describe, expect, it } from "vitest";
import { outingParticipants, outings, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;

let db: TestDb;

beforeAll(async () => {
  db = await createTestDatabase();
});

describe("pessoas", () => {
  it("só aceita telefone no formato internacional", async () => {
    for (const phone of ["11999990000", "+0551199999", "(11) 99999-0000", "+55"]) {
      await expect(db.insert(people).values({ displayName: "Ana", phone })).rejects.toThrow();
    }
  });

  it("o mesmo telefone é a mesma pessoa", async () => {
    await db.insert(people).values({ displayName: "Ana", phone: "+5511988880001" });
    await expect(db.insert(people).values({ displayName: "Outra Ana", phone: "+5511988880001" })).rejects.toThrow();
  });

  it("exige nome preenchido", async () => {
    await expect(db.insert(people).values({ displayName: "   ", phone: "+5511988880002" })).rejects.toThrow();
  });
});

describe("rolês", () => {
  it("cada rolê tem um único dono, e cada pessoa entra uma vez", async () => {
    const { outing, lucas, maria } = await seedOuting(db, ["+5511977770001", "+5511977770002"]);
    await expect(
      db.insert(outingParticipants).values({ outingId: outing.id, personId: maria.id, role: "admin" }),
    ).rejects.toThrow();
    await expect(
      db.insert(outingParticipants).values({ outingId: outing.id, personId: lucas.id, role: "member" }),
    ).rejects.toThrow();
  });

  it("rolê encerrado precisa da data de encerramento, e o ativo não pode ter", async () => {
    const { lucas } = await seedOuting(db, ["+5511966660001", "+5511966660002"]);
    await expect(
      db.insert(outings).values({ name: "Bar", kind: "event", createdBy: lucas.id, status: "closed" }),
    ).rejects.toThrow();
    await expect(
      db.insert(outings).values({ name: "Bar", kind: "event", createdBy: lucas.id, closedAt: new Date() }),
    ).rejects.toThrow();
    await db.insert(outings).values({ name: "Bar", kind: "event", createdBy: lucas.id, status: "closed", closedAt: new Date() });
  });

  it("não aceita tipo, situação ou papel inventados", async () => {
    const { outing, lucas } = await seedOuting(db, ["+5511955550001", "+5511955550002"]);
    await expect(
      db.insert(outings).values({ name: "Festa", kind: "party" as "event", createdBy: lucas.id }),
    ).rejects.toThrow();
    await expect(
      db.insert(outings).values({ name: "Festa", kind: "event", status: "done" as "active", createdBy: lucas.id }),
    ).rejects.toThrow();
    const [ana] = await db.insert(people).values({ displayName: "Ana", phone: "+5511955550003" }).returning();
    await expect(
      db.insert(outingParticipants).values({ outingId: outing.id, personId: ana.id, role: "boss" as "member" }),
    ).rejects.toThrow();
  });
});
