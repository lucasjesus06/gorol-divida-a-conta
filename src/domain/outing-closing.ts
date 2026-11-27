import { DomainError } from "./domain-error";
import { formatCents, type Cents } from "./money";

export type Blocker = { code: "open_balance" | "pending_payments" | "guest_account_pending" | "owner_cannot_leave" | "open_bill"; message: string };

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export type CloseInput = {
  /** Net balance of each participant in the outing: negative owes, positive is owed. */
  balances: { name: string; netCents: Cents }[];
  /** Payments declared and still waiting for the creditor. */
  pendingPayments: number;
  /** People without an account who asked for one and wait for the answer. */
  guestsAwaitingAccount: string[];
  /** Consumption bills still open. */
  openBills: number;
};

/** Why the owner cannot close the outing yet; empty when it can be closed. */
export function closeBlockers(input: CloseInput): Blocker[] {
  const blockers: Blocker[] = [];
  const open = input.balances.filter((balance) => balance.netCents !== 0);
  if (open.length > 0) {
    blockers.push({
      code: "open_balance",
      message: `Ainda há saldo em aberto: ${joinNames(open.map((balance) => `${balance.name} (${balance.netCents < 0 ? "deve" : "tem a receber"} ${formatCents(Math.abs(balance.netCents))})`))}.`,
    });
  }
  if (input.pendingPayments > 0) {
    blockers.push({
      code: "pending_payments",
      message: `Há ${input.pendingPayments} pagamento(s) esperando confirmação.`,
    });
  }
  if (input.guestsAwaitingAccount.length > 0) {
    blockers.push({
      code: "guest_account_pending",
      message: `Aguardando a resposta do cadastro de ${joinNames(input.guestsAwaitingAccount)}.`,
    });
  }
  if (input.openBills > 0) {
    blockers.push({ code: "open_bill", message: `Há ${input.openBills} conta(s) por consumo ainda aberta(s).` });
  }
  return blockers;
}

export function assertCanClose(input: CloseInput): void {
  const [first] = closeBlockers(input);
  if (first) {
    throw new DomainError("outing_cannot_close", `Não dá para encerrar o rolê: ${first.message}`);
  }
}

export type LeaveInput = {
  isOwner: boolean;
  /** What is still open between this person and each of the others, from this person's point of view. */
  openWith: { name: string; netCents: Cents }[];
  pendingPayments: number;
  /** The person has items marked in a consumption bill that is still open. */
  hasOpenBillClaims: boolean;
};

/**
 * Why a person cannot leave (or be removed from) the outing now. It looks at every
 * other person, not only the owner: whoever would be left holding a debt or a credit
 * that depended on this person must not be harmed by the exit.
 */
export function leaveBlockers(input: LeaveInput): Blocker[] {
  if (input.isOwner) {
    return [{ code: "owner_cannot_leave", message: "O dono não sai do rolê: encerre o rolê quando tudo estiver acertado." }];
  }
  const blockers: Blocker[] = [];
  const open = input.openWith.filter((entry) => entry.netCents !== 0);
  if (open.length > 0) {
    blockers.push({
      code: "open_balance",
      message: `Ainda há acerto em aberto com ${joinNames(open.map((entry) => `${entry.name} (${entry.netCents < 0 ? "deve" : "tem a receber"} ${formatCents(Math.abs(entry.netCents))})`))}.`,
    });
  }
  if (input.pendingPayments > 0) {
    blockers.push({ code: "pending_payments", message: `Há ${input.pendingPayments} pagamento(s) esperando confirmação.` });
  }
  if (input.hasOpenBillClaims) {
    blockers.push({ code: "open_bill", message: "Há itens marcados em uma conta por consumo ainda aberta." });
  }
  return blockers;
}

export function assertCanLeave(input: LeaveInput, self: boolean): void {
  const [first] = leaveBlockers(input);
  if (first) {
    const prefix = self ? "Você não pode sair do rolê agora" : "Não dá para remover esta pessoa agora";
    throw new DomainError("participant_cannot_leave", `${prefix}: ${first.message}`);
  }
}
