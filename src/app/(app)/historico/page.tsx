import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { PageHeader } from "@/components/layout/PageHeader";
import { getRenderProfile } from "@/server/auth";
import { listOutings } from "@/server/outings";

export const metadata: Metadata = {
  title: "Histórico · GoRolê",
};

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;

async function History() {
  const profile = await getRenderProfile();
  const closed = (await listOutings(profile.personId)).filter((outing) => outing.status === "closed");

  return (
    <>
      <PageHeader title="Histórico" description="Os rolês que já foram encerrados." />
      {closed.length === 0 ? (
        <div className="card-surface p-6">
          <p className="text-sm text-muted-foreground">Quando um rolê for encerrado, ele aparece aqui, com as despesas e os acertos.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {closed.map((outing) => (
            <li key={outing.id}>
              <Link href={`/roles/${outing.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                <span className="truncate font-semibold">{outing.name}</span>
                <Pill>{kindLabels[outing.kind]}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <History />
    </Suspense>
  );
}
