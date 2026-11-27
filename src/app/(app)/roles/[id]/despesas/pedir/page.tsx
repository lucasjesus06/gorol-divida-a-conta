import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DomainError } from "@/domain/domain-error";
import { formatCents } from "@/domain/money";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { listExpenses, listPayers } from "@/server/expenses";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = {
  title: "Pedir para virar pagante · GoRolê",
};

async function RequestPayer({ params }: Pick<PageProps<"/roles/[id]/despesas/pedir">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let people;
  let expenses;
  try {
    [people, expenses] = await Promise.all([listPayers(profile.personId, id), listExpenses(profile.personId, id)]);
  } catch (error) {
    if (error instanceof DomainError && error.code === "outing_not_found") {
      notFound();
    }
    throw error;
  }

  const alreadyPayer = people.find((person) => person.personId === profile.personId)?.isPayer === true;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const withMe = people.map((person) => ({ ...person, isPayer: person.isPayer || person.personId === profile.personId }));

  return (
    <>
      <PageHeader
        title="Pedir para virar pagante"
        description="Conte o que você pagou e como dividir. O dono do rolê decide, e se aprovar você passa a ser pagante."
        backHref={`/roles/${id}?visao=despesas`}
      />
      <div className="card-surface p-6">
        {alreadyPayer ? (
          <p className="text-sm">Você já é pagante: registre a despesa direto.</p>
        ) : (
          <ExpenseForm
            outingId={id}
            me={profile.personId}
            idempotencyKey={crypto.randomUUID()}
            intent="request"
            targetExpenses={expenses
              .filter((expense) => expense.status === "active")
              .map((expense) => ({ id: expense.id, label: `${expense.description} (${formatCents(expense.totalCents)})` }))}
            people={withMe}
            defaults={{ description: "", total: "", date: today, method: "equal", payers: {}, shares: {} }}
          />
        )}
      </div>
    </>
  );
}

export default function RequestPayerPage(props: PageProps<"/roles/[id]/despesas/pedir">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <RequestPayer params={props.params} />
    </Suspense>
  );
}
