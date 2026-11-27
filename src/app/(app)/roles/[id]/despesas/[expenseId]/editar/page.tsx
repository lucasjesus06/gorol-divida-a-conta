import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getExpense, listPayers } from "@/server/expenses";
import { ExpenseForm } from "../../expense-form";

export const metadata: Metadata = {
  title: "Corrigir despesa · GoRolê",
};

const centsToText = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

async function EditExpense({ params }: Pick<PageProps<"/roles/[id]/despesas/[expenseId]/editar">, "params">) {
  const { id, expenseId } = await params;
  if (!isUuid(id) || !isUuid(expenseId)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let expense;
  let people;
  try {
    [expense, people] = await Promise.all([getExpense(profile.personId, id, expenseId), listPayers(profile.personId, id)]);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "outing_not_found" || error.code === "expense_not_found")) {
      notFound();
    }
    throw error;
  }

  return (
    <>
      <PageHeader title="Corrigir despesa" description="A versão anterior continua no histórico." backHref={`/roles/${id}/despesas/${expenseId}`} />
      <div className="card-surface p-6">
        {expense.canChange ? (
          <ExpenseForm
            outingId={id}
            me={profile.personId}
            idempotencyKey={crypto.randomUUID()}
            people={people}
            defaults={{
              expenseId,
              description: expense.description,
              total: centsToText(expense.totalCents),
              date: expense.occurredAt.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }),
              method: expense.splitMethod === "equal" ? "equal" : "exact",
              payers: Object.fromEntries(expense.payers.map((payer) => [payer.personId, centsToText(payer.amountCents)])),
              shares: Object.fromEntries(expense.shares.map((share) => [share.personId, centsToText(share.amountCents)])),
            }}
          />
        ) : (
          <p className="text-sm">Só quem registrou a despesa ou o dono do rolê pode corrigi-la.</p>
        )}
      </div>
    </>
  );
}

export default function EditExpensePage(props: PageProps<"/roles/[id]/despesas/[expenseId]/editar">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <EditExpense params={props.params} />
    </Suspense>
  );
}
