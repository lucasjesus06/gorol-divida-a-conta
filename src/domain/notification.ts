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
