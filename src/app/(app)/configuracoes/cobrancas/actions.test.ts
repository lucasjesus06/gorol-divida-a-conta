import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ requireSuperAdmin: vi.fn() }));
const charges = vi.hoisted(() => ({ recordReminder: vi.fn(), pauseCharges: vi.fn(), saveTemplates: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/charges", () => charges);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const actions = await import("./actions");

const debtorId = "11111111-1111-4111-8111-111111111111";
const creditorId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireSuperAdmin.mockResolvedValue({ userId: "u1", personId: "admin1" });
});

describe("cobranças", () => {
  it("registra o disparo em nome do super admin", async () => {
    expect(await actions.recordReminderAction({ debtorId, creditorId, channel: "whatsapp" })).toEqual({ done: true });
    expect(charges.recordReminder).toHaveBeenCalledWith("admin1", { debtorId, creditorId, channel: "whatsapp" });
  });

  it("não chama o servidor com canal ou pessoa inválidos", async () => {
    expect(await actions.recordReminderAction({ debtorId, creditorId, channel: "sms" as "app" })).toHaveProperty("error");
    expect(await actions.recordReminderAction({ debtorId: "x", creditorId, channel: "app" })).toHaveProperty("error");
    expect(charges.recordReminder).not.toHaveBeenCalled();
  });

  it("devolve a mensagem da regra, como no intervalo mínimo", async () => {
    charges.recordReminder.mockRejectedValue(new DomainError("reminder_not_allowed", "Esta cobrança não pode ser enviada agora."));
    expect(await actions.recordReminderAction({ debtorId, creditorId, channel: "app" })).toEqual({ error: "Esta cobrança não pode ser enviada agora." });
  });

  it("registra a pausa e salva os textos enviados no formulário", async () => {
    await actions.pauseChargesAction({ debtorId, creditorId });
    expect(charges.pauseCharges).toHaveBeenCalledWith("admin1", { debtorId, creditorId });

    const data = new FormData();
    data.append("template", "Oi {nome}");
    data.append("template", "Eita {nome}");
    expect(await actions.saveTemplatesAction({}, data)).toEqual({ done: true });
    expect(charges.saveTemplates).toHaveBeenCalledWith("admin1", ["Oi {nome}", "Eita {nome}"]);
  });
});
