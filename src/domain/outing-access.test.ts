import { describe, expect, it } from "vitest";
import { assertAdmin, assertParticipant } from "./outing-access";

const notFound = expect.objectContaining({ code: "outing_not_found" });

describe("outing access", () => {
  it("lets active participants and admins in", () => {
    expect(() => assertParticipant({ role: "member", status: "active" })).not.toThrow();
    expect(() => assertParticipant({ role: "admin", status: "active" })).not.toThrow();
  });

  it("answers not found to people outside the outing or who left it", () => {
    expect(() => assertParticipant(null)).toThrowError(notFound);
    expect(() => assertParticipant({ role: "member", status: "left" })).toThrowError(notFound);
  });

  it("lets only the admin manage the outing", () => {
    expect(() => assertAdmin({ role: "admin", status: "active" })).not.toThrow();
    expect(() => assertAdmin({ role: "member", status: "active" })).toThrowError(
      expect.objectContaining({ code: "only_admin_manages_outing" }),
    );
    expect(() => assertAdmin(null)).toThrowError(notFound);
  });
});
