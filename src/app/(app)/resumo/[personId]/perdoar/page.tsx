import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DomainError } from "@/domain/domain-error";
import { formatCents } from "@/domain/money";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getForgivable } from "@/server/amnesties";
import { AmnestyForm } from "./amnesty-form";

export const metadata: Metadata = {
  title: "Perdoar dívida · GoRolê",
};

async function Forgive({ params }: Pick<PageProps<"/resumo/[personId]/perdoar">, "params">) {
  const { personId: debtorId } = await params;
  if (!isUuid(debtorId)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let view;
  try {
    view = await getForgivable(profile.personId, debtorId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "person_not_found") {
      notFound();
    }
    throw error;
  }
  const rows = view.expenses.filter((row) => row.remainingCents > 0);

  return (
    <>
      <PageHeader title={`Perdoar dívida de ${view.debtor.name}`} backHref={`/resumo/${debtorId}`} description={`${view.debtor.name} ainda deve ${formatCents(view.maxCents)} a você. Marque o que quer perdoar.`} />
      <div className="card-surface p-6">
        {view.maxCents === 0 || rows.length === 0 ? (
          <p className="text-sm">{view.debtor.name} não deve nada a você agora, então não há o que perdoar.</p>
        ) : (
          <AmnestyForm debtorId={debtorId} debtorName={view.debtor.name} rows={rows} idempotencyKey={crypto.randomUUID()} />
        )}
      </div>
    </>
  );
}

export default function ForgivePage(props: PageProps<"/resumo/[personId]/perdoar">) {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Forgive params={props.params} />
    </Suspense>
  );
}
