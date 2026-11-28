import { CLOSING_VOTE_DAYS } from "./closing-vote";
import { formatCents, type Cents } from "./money";
import type { NotificationKind } from "./notification-kinds";

export { notificationKinds, type NotificationKind } from "./notification-kinds";

export type NotificationDraft = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Always an address inside the app, so a notification can never send someone elsewhere. */
  url: string;
};

const MAX_TITLE = 80;
const MAX_BODY = 200;

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function draft(kind: NotificationKind, title: string, body: string, url: string): NotificationDraft {
  return { kind, title: clip(title, MAX_TITLE), body: clip(body, MAX_BODY), url };
}

/** To the outing owner: a guest asked to turn the temporary access into an account. */
export function guestRequestedAccount(input: { guestName: string; outingId: string; outingName: string }) {
  return draft(
    "guest_requested_account",
    "Pedido de cadastro",
    `${input.guestName} pediu cadastro em ${input.outingName}.`,
    `/roles/${input.outingId}?visao=participantes`,
  );
}

/** To the outing owner: someone used the link and waits for approval. */
export function joinRequested(input: { personName: string; outingId: string; outingName: string }) {
  return draft(
    "join_requested",
    "Pedido para entrar no rolê",
    `${input.personName} quer entrar em ${input.outingName}.`,
    `/roles/${input.outingId}?visao=participantes`,
  );
}

/** To the creditor: the debtor says the Pix was made and waits for confirmation. */
export function paymentDeclared(input: { fromName: string; amountCents: Cents; outingId: string; outingName: string }) {
  return draft(
    "payment_declared",
    "Pagamento a confirmar",
    `${input.fromName} declarou ter pago ${formatCents(input.amountCents)} em ${input.outingName}. Chegou o Pix?`,
    `/roles/${input.outingId}?visao=pagamentos`,
  );
}

/** To the person a consumption bill's leftover was handed to, who must accept or refuse it. */
export function billPartTransferred(input: { fromName: string; billName: string; outingId: string; billId: string }) {
  return draft(
    "bill_part_transferred",
    "Sobrou uma parte da conta para você",
    `${input.fromName} passou para você o que sobrou da conta "${input.billName}". Quer aceitar?`,
    `/roles/${input.outingId}/contas/${input.billId}`,
  );
}

/** To the debtor: a friendly reminder that a Pix is still open. */
export function paymentReminder(input: { creditorId: string; creditorName: string; amountCents: Cents }) {
  return draft(
    "payment_reminder",
    "E o Pix?",
    `Você ainda deve ${formatCents(input.amountCents)} a ${input.creditorName}. Toque para ver e pagar.`,
    `/resumo/${input.creditorId}`,
  );
}

/** To everyone in the outing: the owner closed it. Debts that were left stay between the people. */
export function outingClosed(input: { outingId: string; outingName: string }) {
  return draft("outing_closed", "Rolê encerrado", `${input.outingName} foi encerrado. Nada mais é lançado nele.`, `/roles/${input.outingId}`);
}

/** To the person the owner took out of the outing. */
export function participantRemoved(input: { outingName: string }) {
  return draft("participant_removed", "Você saiu de um rolê", `O dono tirou você de ${input.outingName}.`, "/roles");
}

/** To the owner: someone left the outing on their own. */
export function participantLeft(input: { personName: string; outingId: string; outingName: string }) {
  return draft("participant_left", "Alguém saiu do rolê", `${input.personName} saiu de ${input.outingName}.`, `/roles/${input.outingId}?visao=participantes`);
}

/** To whoever is owed money: the owner wants to close the outing and they have a say. */
export function closingVoteRequested(input: { outingId: string; outingName: string; ownerName: string; days?: number }) {
  return draft(
    "closing_vote_requested",
    "Encerrar o rolê?",
    `${input.ownerName} quer encerrar ${input.outingName}. A dívida entre vocês continua. Se ninguém disser nada em ${input.days ?? CLOSING_VOTE_DAYS} dias, vale como aceite.`,
    `/roles/${input.outingId}`,
  );
}

/** To everyone in the outing: how the vote to close it ended. */
export function closingVoteResolved(input: { outingId: string; outingName: string; result: "approved" | "rejected" | "cancelled" }) {
  const texts = {
    approved: `${input.outingName} foi encerrado. As dívidas entre as pessoas continuam.`,
    rejected: `Alguém não aceitou encerrar ${input.outingName}. O rolê continua aberto.`,
    cancelled: `Os saldos de ${input.outingName} mudaram, então o pedido de encerramento foi cancelado.`,
  } as const;
  return draft("closing_vote_resolved", input.result === "approved" ? "Rolê encerrado" : "Encerramento não aconteceu", texts[input.result], `/roles/${input.outingId}`);
}

/** To everyone in the outing: a late dispute opened it again. */
export function outingReopened(input: { outingId: string; outingName: string; personName: string }) {
  return draft(
    "outing_reopened",
    "Rolê reaberto",
    `${input.personName} contestou uma despesa de ${input.outingName} depois do prazo, e o rolê foi reaberto para o dono avaliar.`,
    `/roles/${input.outingId}`,
  );
}

/** To the debtor: one notification per amnesty, listing what was forgiven. */
export function amnestyGranted(input: { creditorId: string; creditorName: string; totalCents: Cents; descriptions: string[] }) {
  const shown = input.descriptions.slice(0, 3).join(", ");
  const rest = input.descriptions.length > 3 ? ` e mais ${input.descriptions.length - 3}` : "";
  return draft(
    "amnesty_granted",
    "Dívida perdoada",
    `${input.creditorName} perdoou ${formatCents(input.totalCents)} do que você devia: ${shown}${rest}.`,
    `/resumo/${input.creditorId}`,
  );
}

/** To the other person: someone asks to share expenses permanently. */
export function sharedFundRequested(input: { requesterName: string }) {
  return draft(
    "shared_fund_requested",
    "Despesas compartilhadas",
    `${input.requesterName} quer declarar que vocês dividem as mesmas despesas. Se você aceitar, não haverá dívida entre vocês daqui em diante.`,
    "/configuracoes/despesas-compartilhadas",
  );
}

/** To the other person: how the request, or the arrangement, ended. */
export function sharedFundResolved(input: { name: string; result: "accepted" | "declined" | "ended" }) {
  const texts = {
    accepted: `${input.name} aceitou: vocês passam a dividir as mesmas despesas, e a dívida que havia entre vocês foi perdoada.`,
    declined: `${input.name} não aceitou dividir as mesmas despesas.`,
    ended: `${input.name} desfez a declaração de despesas compartilhadas. O que foi lançado até agora continua como estava.`,
  } as const;
  return draft("shared_fund_resolved", "Despesas compartilhadas", texts[input.result], "/configuracoes/despesas-compartilhadas");
}

/** To the creditor: the receipt matched the declared payment, which is settled for now; they can still contest it. */
export function paymentSettledByReceipt(input: { fromName: string; amountCents: Cents; outingId: string; outingName: string; contestDays: number }) {
  return draft(
    "payment_declared",
    "Pagamento confirmado por comprovante",
    `${input.fromName} enviou o comprovante de ${formatCents(input.amountCents)} em ${input.outingName}. Se o dinheiro não chegou, você tem ${input.contestDays} dias para contestar.`,
    `/roles/${input.outingId}?visao=pagamentos`,
  );
}

/** To the creditor: the receipt differs from the declared payment, so it waits for their decision. */
export function paymentReceiptNeedsReview(input: { fromName: string; amountCents: Cents; outingId: string; outingName: string }) {
  return draft(
    "payment_receipt_review",
    "Comprovante para avaliar",
    `O comprovante de ${input.fromName} (${formatCents(input.amountCents)}, ${input.outingName}) tem diferenças em relação ao pagamento declarado. Veja e decida.`,
    `/roles/${input.outingId}?visao=pagamentos`,
  );
}

/** To the payer: the creditor says the money did not arrive. */
export function paymentContested(input: { toName: string; amountCents: Cents; outingId: string; outingName: string }) {
  return draft(
    "payment_contested",
    "Pagamento contestado",
    `${input.toName} disse que o pagamento de ${formatCents(input.amountCents)} em ${input.outingName} não chegou. Fale com a pessoa e confirme o Pix.`,
    `/roles/${input.outingId}?visao=pagamentos`,
  );
}
