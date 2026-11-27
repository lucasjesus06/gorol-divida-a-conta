export type Identity =
  | { kind: "account"; userId: string; email: string | null }
  | { kind: "guest"; userId: string };

type Claims = { sub?: unknown; email?: unknown; is_anonymous?: unknown };

export function identityFromClaims(claims: Claims | null | undefined): Identity | null {
  if (!claims || typeof claims.sub !== "string" || claims.sub === "") {
    return null;
  }
  if (claims.is_anonymous === true) {
    return { kind: "guest", userId: claims.sub };
  }
  return { kind: "account", userId: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
