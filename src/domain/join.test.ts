import { describe, expect, it } from "vitest";
import {
  JOIN_LINK_VALIDITY_DAYS,
  MAX_FAILED_ATTEMPTS_PER_OUTING,
  MAX_FAILED_ATTEMPTS_PER_PARTICIPANT,
  assertJoinAttemptsAllowed,
  joinLinkExpiry,
  joinLinkState,
} from "./join";

const createdAt = new Date("2026-01-01T12:00:00Z");

describe("link do rolê", () => {
  it("vence depois do prazo de validade", () => {
    expect(joinLinkExpiry(createdAt)).toEqual(new Date(createdAt.getTime() + JOIN_LINK_VALIDITY_DAYS * 86_400_000));
  });

  it("serve até o vencimento", () => {
    const expiresAt = joinLinkExpiry(createdAt);
    expect(joinLinkState({ revokedAt: null, expiresAt }, new Date(expiresAt.getTime() - 1))).toBe("usable");
    expect(joinLinkState({ revokedAt: null, expiresAt }, expiresAt)).toBe("expired");
  });

  it("link revogado não serve, mesmo dentro do prazo", () => {
    expect(joinLinkState({ revokedAt: createdAt, expiresAt: joinLinkExpiry(createdAt) }, createdAt)).toBe("revoked");
  });
});

describe("limite de tentativas", () => {
  it("deixa tentar abaixo dos limites", () => {
    expect(() =>
      assertJoinAttemptsAllowed({
        forParticipant: MAX_FAILED_ATTEMPTS_PER_PARTICIPANT - 1,
        forOuting: MAX_FAILED_ATTEMPTS_PER_OUTING - 1,
      }),
    ).not.toThrow();
  });

  it("trava quando uma pessoa estoura o limite", () => {
    expect(() => assertJoinAttemptsAllowed({ forParticipant: MAX_FAILED_ATTEMPTS_PER_PARTICIPANT, forOuting: 0 })).toThrowError(
      expect.objectContaining({ code: "too_many_join_attempts" }),
    );
  });

  it("trava quando o rolê inteiro estoura o limite", () => {
    expect(() => assertJoinAttemptsAllowed({ forParticipant: 0, forOuting: MAX_FAILED_ATTEMPTS_PER_OUTING })).toThrowError(
      expect.objectContaining({ code: "too_many_join_attempts" }),
    );
  });
});
