import { describe, expect, it } from "vitest";
import {
  INVITE_VALIDITY_DAYS,
  inviteExpiry,
  inviteState,
  normalizeEmail,
} from "./access";

describe("normalizeEmail", () => {
  it("tira espaços e deixa em minúsculas", () => {
    expect(normalizeEmail("  Maria@Exemplo.COM ")).toBe("maria@exemplo.com");
  });

  it.each(["", "maria", "maria@", "@exemplo.com", "maria@exemplo", "ma ria@exemplo.com", `${"a".repeat(250)}@e.com`])(
    "recusa %j",
    (value) => {
      expect(() => normalizeEmail(value)).toThrow("Informe um e-mail válido.");
    },
  );
});

describe("convites", () => {
  const createdAt = new Date("2026-01-01T12:00:00Z");

  it("vence depois do prazo de validade", () => {
    const expected = new Date(createdAt.getTime() + INVITE_VALIDITY_DAYS * 86_400_000);
    expect(inviteExpiry(createdAt)).toEqual(expected);
  });

  it("está utilizável até o vencimento", () => {
    const expiresAt = inviteExpiry(createdAt);
    expect(inviteState({ usedAt: null, expiresAt }, new Date(expiresAt.getTime() - 1))).toBe("usable");
    expect(inviteState({ usedAt: null, expiresAt }, expiresAt)).toBe("expired");
  });

  it("convite já usado não vale de novo, mesmo dentro do prazo", () => {
    expect(inviteState({ usedAt: createdAt, expiresAt: inviteExpiry(createdAt) }, createdAt)).toBe("used");
    expect(inviteState({ usedAt: null, revokedAt: createdAt, expiresAt: inviteExpiry(createdAt) }, createdAt)).toBe("revoked");
  });
});
