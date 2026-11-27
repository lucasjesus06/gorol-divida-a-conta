import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifications, pushSubscriptions } from "@/db/schema";
import { createTestDatabase, seedOuting } from "@/test/database";

const state = vi.hoisted(() => ({ db: undefined as unknown, send: vi.fn() }));
vi.mock("@/db/client", () => ({
  getDb: () => state.db,
  getServiceDb: () => state.db,
  asService: <T>(work: () => Promise<T>) => work(),
}));
vi.mock("web-push", () => ({ default: { sendNotification: state.send } }));

const server = await import("./push");

type TestDb = Awaited<ReturnType<typeof createTestDatabase>>;
const db = () => state.db as TestDb;

let lucas: string;
let maria: string;

const notice = { kind: "payment_declared" as const, title: "Pagamento a confirmar", body: "Maria pagou", url: "/roles/1" };
const device = { endpoint: "https://push.example/a", p256dh: "p", auth: "a" };

beforeEach(async () => {
  state.db = await createTestDatabase();
  state.send.mockReset();
  state.send.mockResolvedValue({});
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:contato@exemplo.com");
  const seeded = await seedOuting(db(), ["+5511900700001", "+5511900700002"]);
  lucas = seeded.lucas.id;
  maria = seeded.maria.id;
});

describe("notify", () => {
  it("grava na lista e envia o push com o endereço de destino", async () => {
    await server.saveSubscription(lucas, device);
    await server.notify(lucas, notice);

    expect(await server.countUnread(lucas)).toBe(1);
    expect(state.send).toHaveBeenCalledTimes(1);
    const [subscription, payload] = state.send.mock.calls[0];
    expect(subscription).toEqual({ endpoint: device.endpoint, keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(payload)).toMatchObject({ title: notice.title, url: "/roles/1" });
  });

  it("sem chaves VAPID só grava na lista", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    await server.saveSubscription(lucas, device);
    await server.notify(lucas, notice);
    expect(await server.countUnread(lucas)).toBe(1);
    expect(state.send).not.toHaveBeenCalled();
  });

  it("aparelho expirado (410) é removido e o aviso continua na lista", async () => {
    state.send.mockRejectedValue({ statusCode: 410 });
    await server.saveSubscription(lucas, device);
    await server.notify(lucas, notice);
    expect(await db().$count(pushSubscriptions)).toBe(0);
    expect(await server.countUnread(lucas)).toBe(1);
  });

  it("falha passageira do push mantém o aparelho", async () => {
    state.send.mockRejectedValue({ statusCode: 500 });
    await server.saveSubscription(lucas, device);
    await server.notify(lucas, notice);
    expect(await db().$count(pushSubscriptions)).toBe(1);
  });

  it("nunca lança, mesmo quando não consegue gravar", async () => {
    await expect(server.notify("00000000-0000-4000-8000-000000000000", notice)).resolves.toBeUndefined();
  });

  it("não envia push para o aparelho de outra pessoa", async () => {
    await server.saveSubscription(maria, device);
    await server.notify(lucas, notice);
    expect(state.send).not.toHaveBeenCalled();
  });
});

describe("lista de avisos", () => {
  it("lista os mais novos primeiro, só os da pessoa, e marca como lidos", async () => {
    await server.notify(lucas, { ...notice, title: "Primeiro" });
    await server.notify(lucas, { ...notice, title: "Segundo" });
    await server.notify(maria, { ...notice, title: "Da Maria" });

    const list = await server.listNotifications(lucas);
    expect(list.map((item) => item.title)).toEqual(["Segundo", "Primeiro"]);

    await server.markRead(maria, list[0].id);
    expect(await server.countUnread(lucas)).toBe(2);
    await server.markRead(lucas, list[0].id);
    expect(await server.countUnread(lucas)).toBe(1);
    await server.markAllRead(lucas);
    expect(await server.countUnread(lucas)).toBe(0);
    expect(await server.countUnread(maria)).toBe(1);
    expect(await db().$count(notifications)).toBe(3);
  });
});

describe("inscrição do aparelho", () => {
  it("o mesmo aparelho não duplica e passa para quem entrou por último", async () => {
    await server.saveSubscription(lucas, device);
    await server.saveSubscription(maria, { ...device, auth: "novo" });
    const rows = await db().select().from(pushSubscriptions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ personId: maria, auth: "novo" });
  });

  it("recusa endereço que não é https e dados vazios", async () => {
    await expect(server.saveSubscription(lucas, { ...device, endpoint: "http://push.example/a" })).rejects.toMatchObject({ code: "invalid_subscription" });
    await expect(server.saveSubscription(lucas, { ...device, auth: "" })).rejects.toMatchObject({ code: "invalid_subscription" });
  });

  it("só quem é dono remove o aparelho", async () => {
    await server.saveSubscription(lucas, device);
    await server.removeSubscription(maria, device.endpoint);
    expect(await db().$count(pushSubscriptions)).toBe(1);
    await server.removeSubscription(lucas, device.endpoint);
    expect(await db().$count(pushSubscriptions)).toBe(0);
  });
});
