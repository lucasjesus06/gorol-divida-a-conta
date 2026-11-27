import { describe, expect, it } from "vitest";
import { normalizeParticipantInput } from "./participant";

describe("normalizeParticipantInput", () => {
  it("limpa o nome e deixa o telefone no formato internacional", () => {
    expect(normalizeParticipantInput({ name: "  Maria   Souza ", phone: "(11) 99999-0001" })).toEqual({
      displayName: "Maria Souza",
      phone: "+5511999990001",
    });
  });

  it("recusa nome vazio", () => {
    expect(() => normalizeParticipantInput({ name: "  ", phone: "11999990001" })).toThrow("Informe o nome do participante.");
  });

  it("recusa telefone inválido", () => {
    expect(() => normalizeParticipantInput({ name: "Maria", phone: "123" })).toThrow(
      "Informe um telefone válido, com DDD.",
    );
  });
});
