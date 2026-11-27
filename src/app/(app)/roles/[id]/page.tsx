import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Avatar } from "@/components/common/Avatar";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { StatCard } from "@/components/common/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/domain/money";
import { DomainError } from "@/domain/domain-error";
import { cn } from "@/lib/utils";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getActiveJoinLink, listJoinRequests } from "@/server/join";
import { getOutingBalances, type OutingBalancesView } from "@/server/balances";
import { listBills, type BillView } from "@/server/bills";
import { listExpenses, listPayers, type ExpenseView } from "@/server/expenses";
import { listPayerRequests, type PayerRequestView } from "@/server/payer-requests";
import { listPayments, type PaymentView } from "@/server/payments";
import { listFiles, type FileView } from "@/server/files";
import { FileList } from "@/components/files/FileList";
import { FileUploader } from "@/components/files/FileUploader";
import { formatFileSize } from "@/domain/file-rules";
import { getOuting, type OutingDetail } from "@/server/outings";
import { JoinLinkPanel, JoinRequestItem, ReleaseButton } from "./join-panel";
import { DeclarePaymentForm, PixReveal, ResolvePayment } from "./pagamentos/payment-forms";
import { RequestDecision } from "./despesas/request-item";
import { ParticipantForm } from "./participant-form";
import { PayerButton } from "./payer-button";

export const metadata: Metadata = {
  title: "Rolê · GoRolê",
};

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

type View = "resumo" | "despesas" | "acertos" | "pagamentos" | "participantes" | "convite";

function parseView(value: string | string[] | undefined, isAdmin: boolean): View {
  if (value === "participantes") return "participantes";
  if (value === "despesas") return "despesas";
  if (value === "pagamentos") return "pagamentos";
  if (value === "acertos") return "acertos";
  if (value === "convite" && isAdmin) return "convite";
  return "resumo";
}

function Tabs({ outingId, view, isAdmin }: { outingId: string; view: View; isAdmin: boolean }) {
  const tabs: { view: View; label: string }[] = [
    { view: "resumo", label: "Resumo" },
    { view: "despesas", label: "Despesas" },
    { view: "acertos", label: "Acertos" },
    { view: "pagamentos", label: "Pagamentos" },
    { view: "participantes", label: "Participantes" },
    ...(isAdmin ? [{ view: "convite" as const, label: "Convite" }] : []),
  ];

  return (
    <nav aria-label="Visões do rolê" className="mb-6 flex gap-2 overflow-x-auto">
      {tabs.map((tab) => (
        <Link
          key={tab.view}
          href={`/roles/${outingId}?visao=${tab.view}`}
          aria-current={tab.view === view ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
            tab.view === view ? "border-primary-glow bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function Summary({
  outing,
  pendingRequests,
  pendingPayerRequests,
  paymentsToConfirm,
  expenses,
}: {
  outing: OutingDetail;
  pendingRequests: number;
  pendingPayerRequests: number;
  paymentsToConfirm: number;
  expenses: ExpenseView[];
}) {
  const active = expenses.filter((expense) => expense.status === "active");
  const total = active.reduce((sum, expense) => sum + expense.totalCents, 0);
  const joined = outing.participants.filter((participant) => participant.joined).length;
  const waiting = outing.participants.length - joined;
  const isAdmin = outing.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      {active.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Total gasto no rolê: <span className="font-semibold text-foreground">{formatCents(total)}</span>
        </p>
      )}
      <section className="grid grid-cols-2 gap-3">
        <StatCard label="Participantes" value={joined} href={`/roles/${outing.id}?visao=participantes`} />
        <StatCard label="Despesas" value={active.length} href={`/roles/${outing.id}?visao=despesas`} />
        {isAdmin && (
          <StatCard
            label="Pedidos para aprovar"
            value={pendingRequests}
            href={`/roles/${outing.id}?visao=convite`}
            highlight={pendingRequests > 0}
          />
        )}
        {paymentsToConfirm > 0 && <StatCard label="Pagamentos a confirmar" value={paymentsToConfirm} href={`/roles/${outing.id}?visao=pagamentos`} highlight />}
        {isAdmin && (
          <StatCard
            label="Pedidos de pagante"
            value={pendingPayerRequests}
            href={`/roles/${outing.id}?visao=despesas`}
            highlight={pendingPayerRequests > 0}
          />
        )}
        {isAdmin && waiting > 0 && <StatCard label="Ainda não entraram" value={waiting} href={`/roles/${outing.id}?visao=participantes`} />}
      </section>
    </div>
  );
}

const requestStatusLabels = { pending: "Aguardando o dono", approved: "Aprovado", rejected: "Recusado" } as const;

function PayerRequests({ outing, requests }: { outing: OutingDetail; requests: PayerRequestView[] }) {
  const isAdmin = outing.role === "admin";
  if (requests.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{isAdmin ? "Pedidos para virar pagante" : "Seus pedidos"}</h2>
      <ul className="flex flex-col gap-3">
        {requests.map((request) => (
          <li key={request.id} className="card-surface flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold">{request.description}</span>
              <span className="font-bold">{formatCents(request.totalCents)}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {isAdmin ? `${request.requestedBy.name} pediu` : "Você pediu"}
              {request.targetExpenseId ? " para ajustar uma despesa já registrada" : " para registrar uma despesa nova"} ·{" "}
              {requestStatusLabels[request.status]}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {request.payers.map((payer) => (
                <li key={payer.personId} className="flex justify-between">
                  <span>{payer.name} pagou</span>
                  <span className="font-semibold">{formatCents(payer.amountCents)}</span>
                </li>
              ))}
            </ul>
            {request.decisionNote && <p className="text-sm">Observação do dono: {request.decisionNote}</p>}
            {isAdmin && request.status === "pending" && <RequestDecision outingId={outing.id} requestId={request.id} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExpensesView({
  outing,
  expenses,
  canRegister,
  requests,
  bills,
}: {
  outing: OutingDetail;
  expenses: ExpenseView[];
  canRegister: boolean;
  requests: PayerRequestView[];
  bills: BillView[];
}) {
  const openBills = bills.filter((bill) => bill.status !== "closed");
  return (
    <div className="flex flex-col gap-4">
      {outing.status === "active" && (
        <Button asChild className="self-start" variant={canRegister ? "default" : "secondary"}>
          <Link href={canRegister ? `/roles/${outing.id}/despesas/nova` : `/roles/${outing.id}/despesas/pedir`}>
            {canRegister ? "Nova despesa" : "Pedir para virar pagante"}
          </Link>
        </Button>
      )}
      {canRegister && outing.status === "active" && (
        <Button asChild variant="secondary" className="self-start">
          <Link href={`/roles/${outing.id}/contas/nova`}>Nova conta por consumo</Link>
        </Button>
      )}
      {openBills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-bold">Contas abertas</h2>
          <ul className="flex flex-col gap-2">
            {openBills.map((bill) => (
              <li key={bill.id}>
                <Link href={`/roles/${outing.id}/contas/${bill.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{bill.description}</span>
                    <span className="text-xs text-muted-foreground">{bill.status === "closing" ? "Aguardando aceite" : "Marque o que você consumiu"}</span>
                  </span>
                  <span className="font-bold">{formatCents(bill.totalCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <PayerRequests outing={outing} requests={requests} />
      {expenses.length === 0 ? (
        <p className="card-surface p-5 text-sm text-muted-foreground">
          {canRegister ? "Nenhuma despesa ainda. Registre a primeira." : "Nenhuma despesa registrada ainda."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {expenses.map((expense) => (
            <li key={expense.id}>
              <Link href={`/roles/${outing.id}/despesas/${expense.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                <span className="flex min-w-0 flex-col">
                  <span className={cn("truncate font-semibold", expense.status === "voided" && "line-through")}>{expense.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {expense.payers.map((payer) => payer.name).join(", ")} pagou{expense.payers.length > 1 ? "ram" : ""}
                    {expense.status === "voided" ? " · anulada" : ""}
                  </span>
                </span>
                <span className="font-bold">{formatCents(expense.totalCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const paymentStatusLabels = { declared: "Aguardando confirmação", confirmed: "Confirmado", contested: "Contestado", rejected: "Recusado" } as const;

function PaymentsView({
  outing,
  payments,
  people,
  me,
  defaults,
  receipts,
}: {
  outing: OutingDetail;
  payments: PaymentView[];
  receipts: FileView[];
  people: { personId: string; name: string }[];
  me: string;
  defaults: { toId?: string; amount?: string };
}) {
  return (
    <div className="flex flex-col gap-8">
      {outing.status === "active" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Declarar um pagamento</h2>
          <div className="card-surface p-6">
            <DeclarePaymentForm outingId={outing.id} people={people} me={me} idempotencyKey={crypto.randomUUID()} defaults={defaults} />
          </div>
        </section>
      )}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Pagamentos do rolê</h2>
        {payments.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted-foreground">Nenhum pagamento declarado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {payments.map((payment) => (
              <li key={payment.id} className="card-surface flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">
                    {payment.from.name} → {payment.to.name}
                  </span>
                  <span className="font-bold">{formatCents(payment.amountCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {paymentStatusLabels[payment.status]}
                  {payment.onBehalfOf ? ` · em nome de ${payment.onBehalfOf.name}` : ""}
                </p>
                <FileList
                  revalidate={`/roles/${outing.id}`}
                  files={receipts
                    .filter((file) => file.subjectId === payment.id)
                    .map((file) => ({ id: file.id, name: file.name, sizeLabel: formatFileSize(file.sizeBytes), canRemove: file.ownerId === me }))}
                />
                {payment.from.id === me && payment.status === "declared" && (
                  <FileUploader kind="payment_receipt" outingId={outing.id} subjectId={payment.id} label="Anexar comprovante (opcional)" revalidate={`/roles/${outing.id}`} />
                )}
                {payment.canResolve && <ResolvePayment outingId={outing.id} paymentId={payment.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SettlementsView({ outing, balances, me, route }: { outing: OutingDetail; balances: OutingBalancesView; me: string; route: "inteligente" | "manual" }) {
  const transfers = route === "manual" ? balances.manual : balances.smart;
  const net = balances.mine.netCents;

  return (
    <div className="flex flex-col gap-8">
      <section className="card-surface flex flex-col gap-2 p-5">
        <h2 className="text-lg font-bold">{net < 0 ? "Você deve" : net > 0 ? "Você tem a receber" : "Você está em dia"}</h2>
        {net !== 0 && <p className="text-3xl font-extrabold">{formatCents(Math.abs(net))}</p>}
        {balances.mine.originalDebtCents > 0 && (
          <p className="text-sm text-muted-foreground">
            Devido {formatCents(balances.mine.originalDebtCents)} · pago {formatCents(balances.mine.paidCents)} · pendente {formatCents(balances.mine.pendingCents)}
          </p>
        )}
        {balances.otherOutingsWithDebt.length > 0 && (
          <p className="text-sm">
            Você também deve em outros rolês:{" "}
            {balances.otherOutingsWithDebt.map((other, index) => (
              <span key={other.outingId}>
                {index > 0 && ", "}
                <Link href={`/roles/${other.outingId}?visao=acertos`} className="font-semibold text-primary-glow hover:underline">
                  {other.name} ({formatCents(other.owedCents)})
                </Link>
              </span>
            ))}
            . Dá para quitar também.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Como acertar</h2>
          <div className="flex gap-2 text-sm">
            {(["inteligente", "manual"] as const).map((option) => (
              <Link
                key={option}
                href={`/roles/${outing.id}?visao=acertos&rota=${option}`}
                aria-current={route === option ? "page" : undefined}
                className={cn("rounded-full border px-3 py-1 font-semibold", route === option ? "border-primary-glow bg-primary/15" : "border-border text-muted-foreground")}
              >
                {option === "inteligente" ? "Rota inteligente" : "Rota manual"}
              </Link>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {route === "inteligente"
            ? `Menos Pix possível: ${balances.smart.length} no total${balances.transfersSaved > 0 ? `, ${balances.transfersSaved} a menos que na rota manual` : ""}. Ninguém precisa pagar quem pagou a despesa original; só os saldos finais importam.`
            : "Cada um paga direto a quem deve, só descontando o que duas pessoas devem uma à outra neste rolê."}
        </p>
        {transfers.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted-foreground">Nada a acertar neste rolê.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {transfers.map((transfer) => (
              <li key={`${transfer.fromId}-${transfer.toId}`} className="card-surface flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-semibold">{transfer.fromId === me ? "Você" : transfer.from}</span> paga{" "}
                  <span className="font-semibold">{transfer.toId === me ? "você" : transfer.to}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-bold">{formatCents(transfer.amountCents)}</span>
                  {transfer.fromId === me && (
                    <Button asChild size="sm">
                      <Link href={`/roles/${outing.id}?visao=pagamentos&para=${transfer.toId}&valor=${(transfer.amountCents / 100).toFixed(2).replace(".", ",")}`}>Pagar</Link>
                    </Button>
                  )}
                </span>
                </div>
                {transfer.fromId === me && <PixReveal outingId={outing.id} toId={transfer.toId} amountCents={transfer.amountCents} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Saldo de cada um</h2>
        <ul className="flex flex-col gap-2">
          {balances.balances.map((balance) => (
            <li key={balance.personId} className="card-surface flex items-center justify-between gap-3 p-3 text-sm">
              <span className="font-semibold">{balance.personId === me ? "Você" : balance.name}</span>
              <span className={cn("font-bold", balance.netCents < 0 ? "text-destructive" : balance.netCents > 0 ? "text-primary-glow" : "text-muted-foreground")}>
                {balance.netCents < 0 ? "deve " : balance.netCents > 0 ? "recebe " : "em dia "}
                {balance.netCents !== 0 && formatCents(Math.abs(balance.netCents))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Participants({ outing, payerIds }: { outing: OutingDetail; payerIds: Set<string> }) {
  const isAdmin = outing.role === "admin";

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {outing.participants.map((participant) => (
            <li key={participant.id} className="card-surface flex items-center gap-3 p-3">
              <Avatar name={participant.displayName} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold">
                  {participant.displayName}
                  {participant.role === "admin" && <span className="ml-2 text-xs font-normal text-muted-foreground">dono</span>}
                  {participant.role !== "admin" && payerIds.has(participant.personId) && (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">pagante</span>
                  )}
                  {!participant.joined && <span className="ml-2 text-xs font-normal text-muted-foreground">ainda não entrou</span>}
                  {participant.accountRequested && <span className="ml-2 text-xs font-normal text-primary-glow">pediu cadastro</span>}
                </span>
                {participant.phone && <span className="text-xs text-muted-foreground">{participant.phone}</span>}
              </div>
              {participant.releasable && <ReleaseButton outingId={outing.id} participantId={participant.id} />}
              {outing.role === "admin" && participant.joined && participant.role !== "admin" && !payerIds.has(participant.personId) && (
                <PayerButton outingId={outing.id} personId={participant.personId} />
              )}
            </li>
          ))}
        </ul>
      </section>
      {isAdmin && outing.status === "active" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Adicionar participante</h2>
          <div className="card-surface p-6">
            <ParticipantForm outingId={outing.id} />
          </div>
        </section>
      )}
    </div>
  );
}

async function Invite({ outing, personId }: { outing: OutingDetail; personId: string }) {
  const [requests, link] = await Promise.all([listJoinRequests(personId, outing.id), getActiveJoinLink(personId, outing.id)]);

  return (
    <div className="flex flex-col gap-8">
      {requests.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Pedidos para entrar</h2>
          <ul className="flex flex-col gap-3">
            {requests.map((request) => (
              <JoinRequestItem key={request.id} outingId={outing.id} request={{ id: request.id, name: request.name }} />
            ))}
          </ul>
        </section>
      )}
      {outing.status === "active" ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Link do rolê</h2>
          <div className="card-surface p-6">
            <JoinLinkPanel outingId={outing.id} activeUntil={link ? dateFormat.format(link.expiresAt) : null} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">Este rolê foi encerrado e não aceita novos participantes.</p>
      )}
    </div>
  );
}

async function OutingContent({ params, searchParams }: Pick<PageProps<"/roles/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let outing: OutingDetail;
  try {
    outing = await getOuting(profile.personId, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "outing_not_found") {
      notFound();
    }
    throw error;
  }

  const isAdmin = outing.role === "admin";
  const query = await searchParams;
  const view = parseView(query.visao, isAdmin);
  const [pendingRequests, expenses, people, payerRequests, bills, payments, balances] = await Promise.all([
    isAdmin && view === "resumo" ? listJoinRequests(profile.personId, id).then((requests) => requests.length) : 0,
    view === "resumo" || view === "despesas" ? listExpenses(profile.personId, id) : [],
    listPayers(profile.personId, id),
    view === "despesas" || view === "resumo" ? listPayerRequests(profile.personId, id) : [],
    view === "despesas" ? listBills(profile.personId, id) : [],
    view === "pagamentos" || view === "resumo" ? listPayments(profile.personId, id) : [],
    view === "acertos" ? getOutingBalances(profile.personId, id) : null,
  ]);
  const receipts = view === "pagamentos" ? await listFiles(profile.personId, "payment_receipt", id, payments.map((payment) => payment.id)) : [];
  const payerIds = new Set(people.filter((person) => person.isPayer).map((person) => person.personId));

  return (
    <>
      <PageHeader
        title={outing.name}
        backHref="/roles"
        actions={<Pill>{outing.status === "closed" ? "Encerrado" : kindLabels[outing.kind]}</Pill>}
      />
      <Tabs outingId={outing.id} view={view} isAdmin={isAdmin} />
      {view === "resumo" && <Summary outing={outing} pendingRequests={pendingRequests} expenses={expenses} pendingPayerRequests={payerRequests.filter((request) => request.status === "pending").length} paymentsToConfirm={payments.filter((payment) => payment.canResolve).length} />}
      {view === "despesas" && <ExpensesView outing={outing} expenses={expenses} canRegister={payerIds.has(profile.personId)} requests={payerRequests} bills={bills} />}
      {view === "acertos" && balances && <SettlementsView outing={outing} balances={balances} me={profile.personId} route={query.rota === "manual" ? "manual" : "inteligente"} />}
      {view === "pagamentos" && (
        <PaymentsView
          outing={outing}
          payments={payments}
          receipts={receipts}
          people={people}
          me={profile.personId}
          defaults={{ toId: typeof query.para === "string" ? query.para : undefined, amount: typeof query.valor === "string" ? query.valor : undefined }}
        />
      )}
      {view === "participantes" && <Participants outing={outing} payerIds={payerIds} />}
      {view === "convite" && <Invite outing={outing} personId={profile.personId} />}
    </>
  );
}

export default function OutingPage(props: PageProps<"/roles/[id]">) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <OutingContent params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
