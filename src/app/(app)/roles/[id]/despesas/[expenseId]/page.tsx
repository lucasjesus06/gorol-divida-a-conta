import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/domain-error";
import { formatCents } from "@/domain/money";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getExpense, type ExpenseView } from "@/server/expenses";
import { VoidForm } from "./void-form";

export const metadata: Metadata = {
  title: "Despesa · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const statusLabels = { active: "Ativa", superseded: "Substituída", voided: "Anulada" } as const;

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
  try {
    expense = await getExpense(profile.personId, id, expenseId);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "outing_not_found" || error.code === "expense_not_found")) {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <PageHeader title={expense.description} backHref={`/roles/${id}?visao=despesas`} />
      <div className="flex flex-col gap-8">
        <VersionCard expense={expense} />
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
