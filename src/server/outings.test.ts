import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { outingParticipants, outings, people } from "@/db/schema";
import { approveAccount, createTestDatabase } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));

const { addParticipant, createOuting, getOuting, listOutings } = await import("./outings");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: { personId: string; displayName: string };
let maria: string;
let intruso: string;

async function person(displayName: string, phone: string) {
  const [row] = await db().insert(people).values({ displayName, phone }).returning({ id: people.id });
  return row.id;
}

beforeEach(async () => {
  state.db = await createTestDatabase();
  lucas = { personId: await person("Lucas", "+5511999990000"), displayName: "Lucas" };
  await approveAccount(db(), lucas.personId);
  maria = await person("Maria", "+5511999990001");
  intruso = await person("Intruso", "+5511999990009");
});

describe("criar rolê", () => {
  it("cria o rolê e já coloca o criador como dono, com o nome dele", async () => {
    const id = await createOuting(lucas, { name: "  Churrasco   de sábado ", kind: "event" });

    const detail = await getOuting(lucas.personId, id);
    expect(detail).toMatchObject({ name: "Churrasco de sábado", kind: "event", status: "active", role: "admin" });
    expect(detail.participants).toEqual([
      { id: expect.any(String), displayName: "Lucas", role: "admin", phone: "+5511999990000", joined: true },
    ]);
  });

  it("convidado sem conta aprovada não cria rolê", async () => {
    await expect(createOuting({ personId: maria, displayName: "Maria" }, { name: "Bar", kind: "event" })).rejects.toMatchObject({
      code: "account_not_approved",
    });
    expect(await db().$count(outings)).toBe(0);
  });

  it("recusa nome vazio e tipo inventado sem criar nada", async () => {
    await expect(createOuting(lucas, { name: " ", kind: "event" })).rejects.toMatchObject({ code: "outing_name_required" });
    await expect(createOuting(lucas, { name: "Bar", kind: "festa" })).rejects.toMatchObject({ code: "invalid_outing_kind" });
    expect(await db().$count(outings)).toBe(0);
  });

  it("não deixa o rolê sem dono se o cadastro do dono falhar", async () => {
    await expect(createOuting({ personId: lucas.personId, displayName: "  " }, { name: "Bar", kind: "event" })).rejects.toThrow();
    expect(await db().$count(outings)).toBe(0);
  });
});

describe("listar e abrir", () => {
  it("lista só os rolês de que a pessoa participa, do mais novo ao mais antigo", async () => {
    const primeiro = await createOuting(lucas, { name: "Primeiro", kind: "event" });
    const segundo = await createOuting(lucas, { name: "Segundo", kind: "recurring" });
    await approveAccount(db(), maria);
    await createOuting({ personId: maria, displayName: "Maria" }, { name: "Da Maria", kind: "event" });

    const lista = await listOutings(lucas.personId);
    expect(lista.map((outing) => outing.id)).toEqual([segundo, primeiro]);
    expect(lista[0]).toMatchObject({ name: "Segundo", kind: "recurring", role: "admin" });
  });

  it("quem não participa recebe 'não encontrado'", async () => {
    const id = await createOuting(lucas, { name: "Fechado", kind: "event" });
    await expect(getOuting(intruso, id)).rejects.toMatchObject({ code: "outing_not_found" });
    expect(await listOutings(intruso)).toEqual([]);
  });

  it("participante comum vê os nomes, mas nenhum telefone", async () => {
    await approveAccount(db(), maria);
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await addParticipant(lucas.personId, id, { name: "Mari", phone: "11999990001" });

    const detail = await getOuting(maria, id);
    expect(detail.role).toBe("member");
    expect(detail.participants.map((participant) => participant.displayName)).toEqual(["Lucas", "Mari"]);
    expect(detail.participants.every((participant) => participant.phone === null)).toBe(true);
  });
});

describe("cadastrar participante", () => {
  it("dono cadastra por nome e telefone, e o telefone fica visível só para ele", async () => {
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await addParticipant(lucas.personId, id, { name: "  Bia  ", phone: "(11) 98888-0002" });

    const detail = await getOuting(lucas.personId, id);
    expect(detail.participants.map((participant) => [participant.displayName, participant.phone])).toEqual([
      ["Lucas", "+5511999990000"],
      ["Bia", "+5511988880002"],
    ]);
  });

  it("o mesmo telefone em dois rolês é a mesma pessoa, com o nome que cada dono digitou", async () => {
    const um = await createOuting(lucas, { name: "Um", kind: "event" });
    await approveAccount(db(), maria);
    const dois = await createOuting({ personId: maria, displayName: "Maria" }, { name: "Dois", kind: "event" });
    await addParticipant(lucas.personId, um, { name: "Bia", phone: "11988880002" });
    await addParticipant(maria, dois, { name: "Bianca", phone: "11988880002" });

    const rows = await db().select().from(people).where(eq(people.phone, "+5511988880002"));
    expect(rows).toHaveLength(1);
    const names = await db().select({ name: outingParticipants.displayName }).from(outingParticipants).where(eq(outingParticipants.personId, rows[0].id));
    expect(names.map((row) => row.name).sort()).toEqual(["Bia", "Bianca"]);
  });

  it("não revela o nome de quem já tem cadastro: o rolê mostra o que o dono digitou", async () => {
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await addParticipant(lucas.personId, id, { name: "Mari", phone: "11999990001" });
    const detail = await getOuting(lucas.personId, id);
    expect(detail.participants.map((participant) => participant.displayName)).not.toContain("Maria");
  });

  it("só o dono cadastra", async () => {
    await approveAccount(db(), maria);
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await addParticipant(lucas.personId, id, { name: "Mari", phone: "11999990001" });

    await expect(addParticipant(maria, id, { name: "Carla", phone: "11977770003" })).rejects.toMatchObject({
      code: "only_admin_manages_outing",
    });
    await expect(addParticipant(intruso, id, { name: "Carla", phone: "11977770003" })).rejects.toMatchObject({
      code: "outing_not_found",
    });
    expect(await db().$count(people, eq(people.phone, "+5511977770003"))).toBe(0);
  });

  it("recusa telefone repetido e nome repetido no mesmo rolê, sem deixar pessoa pela metade", async () => {
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await addParticipant(lucas.personId, id, { name: "Mari", phone: "11999990001" });

    await expect(addParticipant(lucas.personId, id, { name: "Outra", phone: "11999990001" })).rejects.toMatchObject({
      code: "already_participant",
    });
    await expect(addParticipant(lucas.personId, id, { name: " mari ", phone: "11966660004" })).rejects.toMatchObject({
      code: "participant_name_taken",
    });
    expect(await db().$count(people, eq(people.phone, "+5511966660004"))).toBe(0);
  });

  it("quem não tem conta aprovada fica aguardando entrar e não vê o rolê", async () => {
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await addParticipant(lucas.personId, id, { name: "Mari", phone: "11999990001" });

    const detail = await getOuting(lucas.personId, id);
    expect(detail.participants.map((participant) => [participant.displayName, participant.joined])).toEqual([
      ["Lucas", true],
      ["Mari", false],
    ]);
    await expect(getOuting(maria, id)).rejects.toMatchObject({ code: "outing_not_found" });
    expect(await listOutings(maria)).toEqual([]);
  });

  it("recusa dados inválidos", async () => {
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await expect(addParticipant(lucas.personId, id, { name: "", phone: "11999990001" })).rejects.toMatchObject({
      code: "participant_name_required",
    });
    await expect(addParticipant(lucas.personId, id, { name: "Bia", phone: "123" })).rejects.toMatchObject({
      code: "invalid_phone",
    });
  });

  it("rolê encerrado não aceita participante novo", async () => {
    const id = await createOuting(lucas, { name: "Churrasco", kind: "event" });
    await db().update(outings).set({ status: "closed", closedAt: new Date() }).where(eq(outings.id, id));
    await expect(addParticipant(lucas.personId, id, { name: "Bia", phone: "11988880002" })).rejects.toMatchObject({
      code: "outing_closed",
    });
  });
});
