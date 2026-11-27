import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const push = vi.hoisted(() => ({ listNotifications: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/push", () => push);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

const actions = await import("./actions");

const id = "11111111-1111-4111-8111-111111111111";

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
  push.listNotifications.mockResolvedValue([{ id, url: "/roles/1?visao=pagamentos" }]);
});

describe("abrir aviso", () => {
  it("marca como lido e leva ao destino do aviso", async () => {
    await expect(actions.openNotificationAction(form({ id }))).rejects.toThrow("REDIRECT:/roles/1?visao=pagamentos");
    expect(push.markRead).toHaveBeenCalledWith("p1", id);
  });

  it("volta para a lista quando o aviso não é da pessoa ou o id é inválido", async () => {
    await expect(actions.openNotificationAction(form({ id: "22222222-2222-4222-8222-222222222222" }))).rejects.toThrow("REDIRECT:/avisos");
    await expect(actions.openNotificationAction(form({ id: "x" }))).rejects.toThrow("REDIRECT:/avisos");
    expect(push.markRead).not.toHaveBeenCalled();
  });
});

describe("marcar tudo como lido", () => {
  it("marca só os avisos de quem pediu", async () => {
    await actions.markAllReadAction();
    expect(push.markAllRead).toHaveBeenCalledWith("p1");
  });
});
