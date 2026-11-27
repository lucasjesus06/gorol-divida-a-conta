import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const outings = vi.hoisted(() => ({ addParticipant: vi.fn() }));

vi.mock("@/server/auth", () => auth);
vi.mock("@/server/outings", () => outings);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { addParticipantAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

const outingId = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Lucas" });
  outings.addParticipant.mockResolvedValue(undefined);
});

describe("addParticipantAction", () => {
  it("cadastra em nome de quem está logado e confirma com o nome", async () => {
    expect(await addParticipantAction({}, form({ outingId, name: " Bia ", phone: "11988880002" }))).toEqual({ added: "Bia" });
    expect(outings.addParticipant).toHaveBeenCalledWith("p1", outingId, { name: " Bia ", phone: "11988880002" });
  });

  it("recusa identificador de rolê que não é UUID sem consultar nada", async () => {
    expect(await addParticipantAction({}, form({ outingId: "x", name: "Bia", phone: "11988880002" }))).toEqual({
      error: "Rolê não encontrado.",
    });
    expect(outings.addParticipant).not.toHaveBeenCalled();
  });

  it("devolve o aviso da regra de negócio", async () => {
    outings.addParticipant.mockRejectedValue(new DomainError("already_participant", "Este telefone já está no rolê."));
    expect(await addParticipantAction({}, form({ outingId, name: "Bia", phone: "11988880002" }))).toEqual({
      error: "Este telefone já está no rolê.",
    });
  });
});
