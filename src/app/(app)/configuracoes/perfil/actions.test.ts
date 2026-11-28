import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/domain-error";

const auth = vi.hoisted(() => ({ getRenderProfile: vi.fn() }));
const profiles = vi.hoisted(() => ({ saveNickname: vi.fn() }));
vi.mock("@/server/auth", () => auth);
vi.mock("@/server/profiles", () => profiles);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveNicknameAction } = await import("./actions");

function form(values: Record<string, string>) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.getRenderProfile.mockResolvedValue({ personId: "p1", displayName: "Maria Souza" });
});

describe("saveNicknameAction", () => {
  it("salva o apelido de quem está logado", async () => {
    expect(await saveNicknameAction({}, form({ nickname: "Mari" }))).toEqual({ saved: true });
    expect(profiles.saveNickname).toHaveBeenCalledWith("p1", "Mari");
  });

  it("devolve a mensagem da regra, como apelido grande demais", async () => {
    profiles.saveNickname.mockRejectedValue(new DomainError("nickname_too_long", "O apelido pode ter no máximo 40 caracteres."));
    expect(await saveNicknameAction({}, form({ nickname: "x" }))).toEqual({ error: "O apelido pode ter no máximo 40 caracteres." });
  });
});
