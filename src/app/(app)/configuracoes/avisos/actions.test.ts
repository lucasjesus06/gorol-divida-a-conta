import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const push = vi.hoisted(() => ({ saveSubscription: vi.fn(), removeSubscription: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/push", () => push);

const { enableDeviceAction, disableDeviceAction } = await import("./actions");

const device = { endpoint: "https://push.example/a", p256dh: "p", auth: "a" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
});

describe("avisos no aparelho", () => {
  it("inscreve o aparelho em nome de quem está logado", async () => {
    expect(await enableDeviceAction(device)).toEqual({});
    expect(push.saveSubscription).toHaveBeenCalledWith("p1", device);
  });

  it("devolve a mensagem da regra quando a inscrição é inválida", async () => {
    push.saveSubscription.mockRejectedValue(new DomainError("invalid_subscription", "Não deu."));
    expect(await enableDeviceAction(device)).toEqual({ error: "Não deu." });
  });

  it("remove o aparelho só da pessoa logada", async () => {
    await disableDeviceAction(device.endpoint);
    expect(push.removeSubscription).toHaveBeenCalledWith("p1", device.endpoint);
  });
});
