import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { outingParticipants, outings, people } from "@/db/schema";
import { approveAccount, createTestDatabase, seedOuting } from "@/test/database";

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
type Tx = Parameters<Parameters<TestDb["transaction"]>[0]>[0];

let db: TestDb;
let lucas: string;
let maria: string;
let ana: string;
let bruno: string;
let churrasco: string;
let outroRole: string;

function as<T>(personId: string | null, work: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('role', 'authenticated', true), set_config('app.person_id', ${personId ?? ""}, true)`);
    return work(tx);
  });
}

const count = (tx: Tx, table: Parameters<Tx["$count"]>[0]) => tx.$count(table);

beforeAll(async () => {
  db = await createTestDatabase();
  const first = await seedOuting(db, ["+5511900000001", "+5511900000002"]);
  const second = await seedOuting(db, ["+5511900000003", "+5511900000004"]);
  lucas = first.lucas.id;
  maria = first.maria.id;
  ana = second.lucas.id;
  bruno = second.maria.id;
  churrasco = first.outing.id;
  outroRole = second.outing.id;
  await approveAccount(db, bruno);
});

describe("quem é de fora não enxerga nada", () => {
  it.each([
    ["outings", outings],
    ["outing_participants", outingParticipants],
  ])("%s", async (_name, table) => {
    const stranger = (await db.insert(people).values({ displayName: "Curioso", phone: `+55119${Math.floor(Math.random() * 1e8)}` }).returning())[0].id;
    expect(await as(stranger, (tx) => count(tx, table))).toBe(0);
  });

  it("sem identidade a requisição não enxerga nada", async () => {
    expect(await as(null, (tx) => count(tx, outings))).toBe(0);
    expect(await as(null, (tx) => count(tx, outingParticipants))).toBe(0);
    expect(await as(null, (tx) => tx.$count(people))).toBe(0);
  });

  it("cada pessoa só vê o rolê em que está", async () => {
    expect((await as(ana, (tx) => tx.select({ id: outings.id }).from(outings))).map((row) => row.id)).toEqual([outroRole]);
    expect((await as(lucas, (tx) => tx.select({ id: outings.id }).from(outings))).map((row) => row.id)).toEqual([churrasco]);
  });
});

describe("quem participa", () => {
  it("vê o rolê, os participantes e o nome de quem está junto", async () => {
    expect(await as(maria, (tx) => count(tx, outingParticipants))).toBe(2);
    const names = await as(maria, (tx) => tx.select({ name: people.displayName }).from(people));
    expect(names.map((row) => row.name).sort()).toEqual(["Lucas", "Maria"]);
  });

  it("não vê gente de outro rolê", async () => {
    const ids = (await as(maria, (tx) => tx.select({ id: people.id }).from(people))).map((row) => row.id);
    expect(ids).not.toContain(ana);
    expect(ids).not.toContain(bruno);
  });

  it("não lê o telefone de ninguém, nem o próprio", async () => {
    await expect(as(maria, (tx) => tx.select({ phone: people.phone }).from(people))).rejects.toThrow();
    await expect(as(maria, (tx) => tx.select().from(people))).rejects.toThrow();
  });

  it("muda o próprio nome, mas não o telefone nem o nome dos outros", async () => {
    await as(maria, (tx) => tx.update(people).set({ displayName: "Maria Clara" }).where(eq(people.id, maria)));
    await as(maria, (tx) => tx.update(people).set({ displayName: "Invasora" }).where(eq(people.id, lucas)));
    const names = await db.select({ id: people.id, name: people.displayName }).from(people);
    expect(names.find((row) => row.id === maria)?.name).toBe("Maria Clara");
    expect(names.find((row) => row.id === lucas)?.name).toBe("Lucas");
    await expect(
      as(maria, (tx) => tx.update(people).set({ phone: "+5511900009999" }).where(eq(people.id, maria))),
    ).rejects.toThrow();
  });
});

describe("administração do rolê", () => {
  it("só o dono altera o rolê", async () => {
    await as(maria, (tx) => tx.update(outings).set({ name: "Golpe" }).where(eq(outings.id, churrasco)));
    await as(ana, (tx) => tx.update(outings).set({ name: "Golpe" }).where(eq(outings.id, churrasco)));
    expect((await db.select().from(outings).where(eq(outings.id, churrasco)))[0].name).toBe("Churrasco de sábado");
    await as(lucas, (tx) => tx.update(outings).set({ name: "Churrasco do Lucas" }).where(eq(outings.id, churrasco)));
    expect((await db.select().from(outings).where(eq(outings.id, churrasco)))[0].name).toBe("Churrasco do Lucas");
  });

  it("ninguém apaga rolê", async () => {
    await as(lucas, (tx) => tx.delete(outings).where(eq(outings.id, churrasco))).catch(() => undefined);
    expect(await db.$count(outings, eq(outings.id, churrasco))).toBe(1);
  });

  it("só o dono inclui participantes", async () => {
    const [carla] = await db.insert(people).values({ displayName: "Carla", phone: "+5511900000010" }).returning();
    await expect(
      as(maria, (tx) => tx.insert(outingParticipants).values({ outingId: churrasco, personId: carla.id, displayName: "Carla" })),
    ).rejects.toThrow();
    await expect(
      as(ana, (tx) => tx.insert(outingParticipants).values({ outingId: churrasco, personId: ana, displayName: "Ana" })),
    ).rejects.toThrow();
    await as(lucas, (tx) => tx.insert(outingParticipants).values({ outingId: churrasco, personId: carla.id, displayName: "Carla" }));
    expect(await as(carla.id, (tx) => count(tx, outings))).toBe(1);
  });

  it("ninguém vira dono de um rolê que não criou", async () => {
    await expect(
      as(ana, (tx) => tx.insert(outingParticipants).values({ outingId: churrasco, personId: ana, displayName: "Ana", role: "admin" })),
    ).rejects.toThrow();
  });
});

describe("criar um rolê", () => {
  it("cria em nome próprio e já entra como dono", async () => {
    const created = await as(bruno, async (tx) => {
      const [outing] = await tx.insert(outings).values({ name: "Pizza", kind: "event", createdBy: bruno }).returning({ id: outings.id });
      await tx.insert(outingParticipants).values({ outingId: outing.id, personId: bruno, displayName: "Bruno", role: "admin" });
      return outing.id;
    });
    expect(await as(bruno, (tx) => tx.$count(outingParticipants, eq(outingParticipants.outingId, created)))).toBe(1);
  });

  it("quem criou e depois saiu deixa de ver o rolê", async () => {
    const [edu] = await db.insert(people).values({ displayName: "Edu", phone: "+5511900000012" }).returning();
    await approveAccount(db, edu.id);
    const outing = await as(edu.id, async (tx) => {
      const [created] = await tx.insert(outings).values({ name: "Cinema", kind: "event", createdBy: edu.id }).returning({ id: outings.id });
      await tx.insert(outingParticipants).values({ outingId: created.id, personId: edu.id, displayName: "Edu", role: "admin" });
      return created.id;
    });
    await as(edu.id, (tx) => tx.delete(outingParticipants).where(eq(outingParticipants.outingId, outing)));
    expect(await as(edu.id, (tx) => count(tx, outings))).toBe(0);
  });

  it("convidado sem conta aprovada não cria rolê", async () => {
    const [guest] = await db.insert(people).values({ displayName: "Convidado", phone: "+5511900000013" }).returning();
    await expect(
      as(guest.id, (tx) => tx.insert(outings).values({ name: "Bar", kind: "event", createdBy: guest.id })),
    ).rejects.toThrow();
  });

  it("conta ainda não aprovada não cria rolê", async () => {
    const [pending] = await db.insert(people).values({ displayName: "Pendente", phone: "+5511900000014" }).returning();
    const userId = crypto.randomUUID();
    await db.execute(sql`insert into auth.users (id, email) values (${userId}, 'pendente@teste.local')`);
    await db.update(people).set({ userId }).where(eq(people.id, pending.id));
    await expect(
      as(pending.id, (tx) => tx.insert(outings).values({ name: "Bar", kind: "event", createdBy: pending.id })),
    ).rejects.toThrow();
  });

  it("ninguém lê as tabelas de acesso pelo cliente comum", async () => {
    for (const table of ["super_admins", "access_requests", "access_invites"]) {
      await expect(as(bruno, (tx) => tx.execute(sql.raw(`select * from ${table}`)))).rejects.toThrow();
    }
  });

  it("não cria rolê em nome de outra pessoa", async () => {
    await expect(
      as(bruno, (tx) => tx.insert(outings).values({ name: "Golpe", kind: "event", createdBy: ana })),
    ).rejects.toThrow();
  });
});

describe("quem ainda não foi aprovado no rolê", () => {
  it("não enxerga o rolê nem os outros participantes (só a própria vaga), e os outros não o enxergam como pessoa", async () => {
    const [edu] = await db.insert(people).values({ displayName: "Edu pendente", phone: "+5511900000015" }).returning();
    await db.insert(outingParticipants).values({ outingId: churrasco, personId: edu.id, displayName: "Edu", confirmedAt: null });

    expect(await as(edu.id, (tx) => count(tx, outings))).toBe(0);
    expect(await as(edu.id, (tx) => tx.$count(outingParticipants, eq(outingParticipants.outingId, churrasco)))).toBe(1);
    const visibleToMaria = await as(maria, (tx) => tx.select({ id: people.id }).from(people));
    expect(visibleToMaria.map((row) => row.id)).not.toContain(edu.id);

    await db.update(outingParticipants).set({ confirmedAt: new Date() }).where(eq(outingParticipants.personId, edu.id));
    expect(await as(edu.id, (tx) => count(tx, outings))).toBe(1);
  });

  it("as tabelas de entrada por link não são lidas pelo cliente comum", async () => {
    for (const table of ["outing_join_links", "outing_join_requests", "outing_join_attempts"]) {
      await expect(as(maria, (tx) => tx.execute(sql.raw(`select * from ${table}`)))).rejects.toThrow();
    }
  });
});

describe("sair do rolê", () => {
  it("cada um sai por conta própria, e quem sai deixa de ver o rolê", async () => {
    const [dani] = await db.insert(people).values({ displayName: "Dani", phone: "+5511900000011" }).returning();
    await db.insert(outingParticipants).values({ outingId: outroRole, personId: dani.id, displayName: "Dani" });
    expect(await as(dani.id, (tx) => count(tx, outings))).toBe(1);
    await as(dani.id, (tx) => tx.delete(outingParticipants).where(eq(outingParticipants.personId, dani.id)));
    expect(await as(dani.id, (tx) => count(tx, outings))).toBe(0);
  });

  it("quem não é dono não remove os outros", async () => {
    await as(maria, (tx) => tx.delete(outingParticipants).where(eq(outingParticipants.personId, lucas)));
    expect(await db.$count(outingParticipants, eq(outingParticipants.personId, lucas))).toBe(1);
  });
});
