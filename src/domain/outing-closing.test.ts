import { describe, expect, it } from "vitest";
import { assertCanClose, assertCanLeave, closeBlockers, leaveBlockers } from "./outing-closing";

const clear = { balances: [{ name: "Lucas", netCents: 0 }, { name: "Maria", netCents: 0 }], pendingPayments: 0, guestsAwaitingAccount: [], openBills: 0 };

describe("closeBlockers", () => {
  it("rolê com tudo zerado pode encerrar", () => {
    expect(closeBlockers(clear)).toEqual([]);
    expect(() => assertCanClose(clear)).not.toThrow();
  });

  it("aponta quem ainda deve ou tem a receber, com o valor", () => {
    const [blocker] = closeBlockers({ ...clear, balances: [{ name: "Lucas", netCents: 3000 }, { name: "Maria", netCents: -1000 }, { name: "Caio", netCents: -2000 }] });
    expect(blocker.code).toBe("open_balance");
    expect(blocker.message).toContain("Lucas (tem a receber R$");
    expect(blocker.message).toContain("Maria (deve");
    expect(blocker.message).toContain(" e Caio");
  });

  it("pagamento esperando, cadastro pendente de convidado e conta aberta também bloqueiam", () => {
    const codes = closeBlockers({ ...clear, pendingPayments: 2, guestsAwaitingAccount: ["Edu"], openBills: 1 }).map((blocker) => blocker.code);
    expect(codes).toEqual(["pending_payments", "guest_account_pending", "open_bill"]);
    expect(() => assertCanClose({ ...clear, pendingPayments: 1 })).toThrow("Não dá para encerrar o rolê");
  });
});

describe("leaveBlockers", () => {
  const free = { isOwner: false, openWith: [{ name: "Lucas", netCents: 0 }], pendingPayments: 0, hasOpenBillClaims: false };

  it("quem não deve nem tem a receber de ninguém sai livre", () => {
    expect(leaveBlockers(free)).toEqual([]);
  });

  it("o dono nunca sai", () => {
    expect(leaveBlockers({ ...free, isOwner: true })[0].code).toBe("owner_cannot_leave");
  });

  it("olha todas as pessoas, não só o dono: quem deve a um terceiro não sai", () => {
    const blockers = leaveBlockers({ ...free, openWith: [{ name: "Lucas", netCents: 0 }, { name: "Caio", netCents: -1500 }] });
    expect(blockers[0].code).toBe("open_balance");
    expect(blockers[0].message).toContain("Caio (deve R$");
  });

  it("quem tem a receber de um terceiro também não sai, para não deixar o terceiro sem cobrança", () => {
    expect(leaveBlockers({ ...free, openWith: [{ name: "Caio", netCents: 500 }] })[0].message).toContain("tem a receber");
  });

  it("pagamento esperando e itens em conta aberta bloqueiam", () => {
    expect(leaveBlockers({ ...free, pendingPayments: 1, hasOpenBillClaims: true }).map((blocker) => blocker.code)).toEqual(["pending_payments", "open_bill"]);
  });

  it("a mensagem muda entre sair sozinho e ser removido", () => {
    const input = { ...free, pendingPayments: 1 };
    expect(() => assertCanLeave(input, true)).toThrow("Você não pode sair");
    expect(() => assertCanLeave(input, false)).toThrow("Não dá para remover");
  });
});
