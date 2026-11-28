import { describe, expect, it } from "vitest";
import { CLOSING_VOTE_DAYS, assertCanAskForVote, balanceSnapshot, closingVoteDeadline, closingVoteOutcome, closingVoters, ownerClosesAlone } from "./closing-vote";

const balances = [
  { personId: "lucas", netCents: 6000 },
  { personId: "maria", netCents: -3000 },
  { personId: "caio", netCents: -3000 },
];

describe("quem vota", () => {
  it("só vota quem tem a receber, quem deve não vota", () => {
    expect(closingVoters(balances)).toEqual(["lucas"]);
    expect(closingVoters([{ personId: "a", netCents: 100 }, { personId: "b", netCents: 200 }, { personId: "c", netCents: -300 }])).toEqual(["a", "b"]);
  });

  it("o dono encerra sozinho quando é o único com a receber", () => {
    expect(ownerClosesAlone(balances, "lucas")).toBe(true);
    expect(ownerClosesAlone(balances, "maria")).toBe(false);
    expect(ownerClosesAlone([{ personId: "lucas", netCents: 100 }, { personId: "bia", netCents: 100 }, { personId: "caio", netCents: -200 }], "lucas")).toBe(false);
    expect(ownerClosesAlone([], "lucas")).toBe(false);
  });
});

describe("snapshot", () => {
  it("é o mesmo para os mesmos saldos, em qualquer ordem, ignorando quem está zerado", () => {
    expect(balanceSnapshot(balances)).toBe(balanceSnapshot([...balances].reverse().concat({ personId: "bia", netCents: 0 })));
  });

  it("muda quando qualquer saldo muda", () => {
    expect(balanceSnapshot(balances)).not.toBe(balanceSnapshot([{ personId: "lucas", netCents: 5000 }, ...balances.slice(1)]));
  });
});

describe("resultado da votação", () => {
  const now = new Date("2026-03-10T12:00:00Z");
  const deadline = closingVoteDeadline(now);

  it("o prazo é de 3 dias", () => {
    expect(CLOSING_VOTE_DAYS).toBe(3);
    expect(deadline.toISOString()).toBe("2026-03-13T12:00:00.000Z");
  });

  it("um não recusa, mesmo antes do fim do prazo e mesmo com os outros calados", () => {
    expect(closingVoteOutcome(["accepted", "rejected", "pending"], deadline, now)).toBe("rejected");
  });

  it("todos aceitando aprova na hora", () => {
    expect(closingVoteOutcome(["accepted", "accepted"], deadline, now)).toBe("approved");
  });

  it("quem falta e dentro do prazo mantém a votação aberta", () => {
    expect(closingVoteOutcome(["accepted", "pending"], deadline, now)).toBe("open");
  });

  it("silêncio depois do prazo vale como aceite, mas um não ainda vale mais", () => {
    const after = new Date(deadline.getTime() + 1);
    expect(closingVoteOutcome(["accepted", "pending"], deadline, after)).toBe("approved");
    expect(closingVoteOutcome(["pending"], deadline, deadline)).toBe("approved");
    expect(closingVoteOutcome(["rejected", "pending"], deadline, after)).toBe("rejected");
  });
});

describe("pedir a votação", () => {
  it("só quando o saldo é o único bloqueio", () => {
    expect(() => assertCanAskForVote({ onlyOpenBalanceBlocks: true, guestsInDebt: [] })).not.toThrow();
    expect(() => assertCanAskForVote({ onlyOpenBalanceBlocks: false, guestsInDebt: [] })).toThrow("outros pontos");
  });

  it("convidado sem conta que ainda deve impede, nomeando a pessoa", () => {
    expect(() => assertCanAskForVote({ onlyOpenBalanceBlocks: true, guestsInDebt: ["Edu"] })).toThrow("Edu");
  });
});
