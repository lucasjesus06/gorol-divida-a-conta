import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { formatCents } from "@/domain/money";
import { cn } from "@/lib/utils";
import { getRelations, relationNet, relationTotals } from "@/server/balances";
import { getRenderProfile } from "@/server/auth";

export const metadata: Metadata = {
  title: "Resumo · GoRolê",
};

async function Summary() {
  const profile = await getRenderProfile();
  const relations = await getRelations(profile.personId);
  const totals = relationTotals(relations);

  return (
    <>
      <PageHeader title="Resumo" description="O que você deve e o que tem a receber, pessoa a pessoa, em todos os rolês." />
      <div className="flex flex-col gap-8">
        <section className="grid grid-cols-2 gap-3">
          <div className="card-surface flex flex-col gap-1 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Você deve</span>
            <span className="text-2xl font-extrabold text-destructive">{formatCents(totals.owe)}</span>
          </div>
          <div className="card-surface flex flex-col gap-1 p-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">A receber</span>
            <span className="text-2xl font-extrabold text-primary-glow">{formatCents(totals.receive)}</span>
          </div>
        </section>

        {relations.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted-foreground">Nenhuma dívida em aberto. Quando houver despesas, elas aparecem aqui.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {relations.map((relation) => {
              const net = relationNet(relation);
              return (
                <li key={relation.otherId}>
                  <Link href={`/resumo/${relation.otherId}`} className="card-surface flex items-center justify-between gap-3 p-4">
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-semibold">{relation.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {net < 0 ? "Você deve" : net > 0 ? "Deve a você" : "Em dia"}
                        {!relation.isAccount ? " · dentro do rolê" : ""}
                      </span>
                    </span>
                    <span className={cn("font-bold", net < 0 ? "text-destructive" : "text-primary-glow")}>{formatCents(Math.abs(net))}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default function SummaryPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Summary />
    </Suspense>
  );
}
