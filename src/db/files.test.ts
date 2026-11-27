import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { files, people } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let outingId: string;
let lucas: string;
let maria: string;
let stranger: string;

function as<T>(personId: string, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId}, true)`);
    return work(tx);
  });
}

const subject = "33333333-3333-4333-8333-333333333333";
const base = { mimeType: "image/jpeg", sizeBytes: 1000, originalName: "nota.jpg" };

beforeAll(async () => {
  db = await createTestDatabase();
  const seeded = await seedOuting(db, ["+5511900900001", "+5511900900002"]);
  outingId = seeded.outing.id;
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
  const [outsider] = await db.insert(people).values({ displayName: "Intruso", phone: "+5511900900003" }).returning();
  stranger = outsider.id;
  await db.insert(files).values([
    { ...base, kind: "expense_evidence", ownerId: lucas, outingId, subjectId: subject, path: "ev/1", status: "ready" },
    { ...base, kind: "expense_evidence", ownerId: lucas, outingId, subjectId: subject, path: "ev/pending", status: "pending" },
    { ...base, kind: "profile_photo", ownerId: lucas, path: "perfil/lucas", status: "ready" },
  ]);
});

describe("arquivos", () => {
  it("participantes do rolê veem a evidência pronta, e só ela", async () => {
    expect((await as(maria, (tx) => tx.select({ path: files.path }).from(files))).map((row) => row.path).sort()).toEqual(["ev/1", "perfil/lucas"]);
    expect(await as(lucas, (tx) => tx.$count(files))).toBe(2);
  });

  it("quem não participa não vê evidência nem a foto de quem não divide rolê com ele", async () => {
    expect(await as(stranger, (tx) => tx.$count(files))).toBe(0);
  });

  it("a foto de perfil aparece para quem divide rolê com a pessoa", async () => {
    const rows = await as(maria, (tx) => tx.select({ path: files.path }).from(files));
    expect(rows.map((row) => row.path)).toContain("perfil/lucas");
  });

  it("o usuário não cria, altera nem apaga arquivo pelo próprio acesso", async () => {
    await expect(as(lucas, (tx) => tx.insert(files).values({ ...base, kind: "profile_photo", ownerId: lucas, path: "perfil/x" }))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.update(files).set({ originalName: "outra.jpg" }))).rejects.toThrow();
    await expect(as(lucas, (tx) => tx.delete(files))).rejects.toThrow();
  });

  it("evidência exige rolê e item; foto de perfil não pode ter nenhum dos dois", async () => {
    await expect(db.insert(files).values({ ...base, kind: "expense_evidence", ownerId: lucas, path: "ev/sem" })).rejects.toThrow();
    await expect(db.insert(files).values({ ...base, kind: "profile_photo", ownerId: lucas, outingId, path: "perfil/com" })).rejects.toThrow();
  });

  it("recusa tamanho zero e tipo de arquivo desconhecido", async () => {
    await expect(db.insert(files).values({ ...base, sizeBytes: 0, kind: "profile_photo", ownerId: maria, path: "perfil/zero" })).rejects.toThrow();
    await expect(db.insert(files).values({ ...base, kind: "video" as "profile_photo", ownerId: maria, path: "perfil/video" })).rejects.toThrow();
  });
});
