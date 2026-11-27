import { describe, expect, it } from "vitest";
import { identityFromClaims } from "./identity";

const USER = "11111111-1111-4111-8111-111111111111";

describe("identityFromClaims", () => {
  it("quem entrou com e-mail tem conta", () => {
    expect(identityFromClaims({ sub: USER, email: "ana@exemplo.com", is_anonymous: false })).toEqual({
      kind: "account",
      userId: USER,
      email: "ana@exemplo.com",
    });
  });

  it("a sessão anônima é de convidado e não carrega e-mail", () => {
    expect(identityFromClaims({ sub: USER, is_anonymous: true })).toEqual({ kind: "guest", userId: USER });
  });

  it("sem sessão ou com sessão sem usuário não há identidade", () => {
    expect(identityFromClaims(null)).toBeNull();
    expect(identityFromClaims(undefined)).toBeNull();
    expect(identityFromClaims({})).toBeNull();
    expect(identityFromClaims({ sub: "" })).toBeNull();
  });

  it("e-mail que não é texto é ignorado", () => {
    expect(identityFromClaims({ sub: USER, email: 42 })).toEqual({ kind: "account", userId: USER, email: null });
  });
});
