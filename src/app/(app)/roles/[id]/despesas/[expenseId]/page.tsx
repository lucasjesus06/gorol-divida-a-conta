import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { FileList } from "@/components/files/FileList";
import { FileUploader } from "@/components/files/FileUploader";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/domain-error";
import { formatFileSize } from "@/domain/file-rules";
import { formatCents } from "@/domain/money";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { listDisputes, type DisputeView } from "@/server/disputes";
import { getExpense, type ExpenseView } from "@/server/expenses";
import { listFiles } from "@/server/files";
import { DisputeDecision, OpenDisputeForm } from "./dispute-forms";
import { VoidForm } from "./void-form";

export const metadata: Metadata = {
  title: "Despesa · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const statusLabels = { active: "Ativa", superseded: "Substituída", voided: "Anulada" } as const;
const subjectLabels = { amount: "o valor", split: "a divisão", not_participated: "\"não participei\"", other: "outro motivo" } as const;
const disputeStatusLabels = { open: "Em análise", approved: "Aceita", rejected: "Recusada" } as const;

function Disputes({ outingId, expenseId, disputes, canChange }: { outingId: string; expenseId: string; disputes: DisputeView[]; canChange: boolean }) {
  if (disputes.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">Contestações</h2>
      <ul className="flex flex-col gap-3">
        {disputes.map((dispute) => (
          <li key={dispute.id} className="card-surface flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">
                {dispute.openedBy.name} contesta {subjectLabels[dispute.subject]}
              </span>
              <Pill>{disputeStatusLabels[dispute.status]}</Pill>
            </div>
            <p className="text-sm">{dispute.message}</p>
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {dispute.approvals.map((approval) => (
                <li key={approval.personId}>
                  {approval.name}: {approval.decision === "pending" ? "aguardando" : approval.decision === "approved" ? "aceitou" : "recusou"}
                  {approval.note ? ` (${approval.note})` : ""}
                </li>
              ))}
            </ul>
            {dispute.status === "approved" && dispute.subject !== "not_participated" && canChange && (
              <Button asChild variant="secondary">
                <Link href={`/roles/${outingId}/despesas/${expenseId}/editar`}>Corrigir despesa</Link>
              </Button>
            )}
            {dispute.canDecide && <DisputeDecision outingId={outingId} disputeId={dispute.id} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { personId: string; name: string; amountCents: number }[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.personId} className="flex justify-between text-sm">
            <span>{row.name}</span>
            <span className="font-semibold">{formatCents(row.amountCents)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function VersionCard({ expense }: { expense: ExpenseView }) {
  return (
    <div className="card-surface flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xl font-extrabold">{formatCents(expense.totalCents)}</span>
        <Pill>{statusLabels[expense.status]}</Pill>
      </div>
      <p className="text-sm text-muted-foreground">
        {dateFormat.format(expense.occurredAt)} · registrada por {expense.registeredBy.name} · versão {expense.version}
      </p>
      {expense.voidReason && <p className="text-sm">Motivo da anulação: {expense.voidReason}</p>}
      <Breakdown title="Quem pagou" rows={expense.payers} />
      <Breakdown title="Quanto cada um assume" rows={expense.shares} />
    </div>
  );
}

async function ExpenseContent({ params }: Pick<PageProps<"/roles/[id]/despesas/[expenseId]">, "params">) {
  const { id, expenseId } = await params;
  if (!isUuid(id) || !isUuid(expenseId)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let expense;
  let disputes: DisputeView[];
  try {
    [expense, disputes] = await Promise.all([getExpense(profile.personId, id, expenseId), listDisputes(profile.personId, id, expenseId)]);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "outing_not_found" || error.code === "expense_not_found")) {
      notFound();
    }
    throw error;
  }

  const evidence = await listFiles(profile.personId, "expense_evidence", id, [expense.id, ...expense.history.map((version) => version.id)]);
  const path = `/roles/${id}/despesas/${expenseId}`;
  const paidIt = expense.payers.some((payer) => payer.personId === profile.personId);
  const involved = paidIt || expense.shares.some((share) => share.personId === profile.personId);

  return (
    <>
      <PageHeader title={expense.description} backHref={`/roles/${id}?visao=despesas`} />
      <div className="flex flex-col gap-8">
        <VersionCard expense={expense} />
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Evidência</h2>
          {evidence.length === 0 && <p className="text-sm text-muted-foreground">Sem evidência anexada. É opcional: foto da nota ou print da conta ajudam todo mundo a conferir o valor.</p>}
          <FileList
            revalidate={path}
            files={evidence.map((file) => ({ id: file.id, name: file.name, sizeLabel: formatFileSize(file.sizeBytes), canRemove: file.ownerId === profile.personId }))}
          />
          {expense.canChange && <FileUploader kind="expense_evidence" outingId={id} subjectId={expense.id} label="Anexar evidência" revalidate={path} />}
        </section>
        {expense.canChange && (
          <section className="flex flex-col gap-4">
            <Button asChild variant="secondary">
              <Link href={`/roles/${id}/despesas/${expenseId}/editar`}>Corrigir despesa</Link>
            </Button>
            <div className="card-surface p-5">
              <VoidForm outingId={id} expenseId={expenseId} />
            </div>
          </section>
        )}
        <Disputes outingId={id} expenseId={expenseId} disputes={disputes} canChange={expense.canChange} />
        {involved && expense.status === "active" && !disputes.some((dispute) => dispute.status === "open" && dispute.openedBy.id === profile.personId) && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Contestar</h2>
            <div className="card-surface p-5">
              <OpenDisputeForm outingId={id} expenseId={expenseId} canOptOut={expense.splitMethod === "equal" && !paidIt} />
            </div>
          </section>
        )}
        {expense.history.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Versões anteriores</h2>
            {expense.history.map((version) => (
              <VersionCard key={version.id} expense={version} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}

export default function ExpensePage(props: PageProps<"/roles/[id]/despesas/[expenseId]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <ExpenseContent params={props.params} />
    </Suspense>
  );
}
