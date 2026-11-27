import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { isApprovedPerson } from "@/server/access";
import { getRenderProfile } from "@/server/auth";
import { listOutings } from "@/server/outings";

export const metadata: Metadata = {
  title: "Rolês · GoRolê",
};

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;

async function Outings() {
  const profile = await getRenderProfile();
  const [all, canCreate] = await Promise.all([listOutings(profile.personId), isApprovedPerson(profile.personId)]);
  const outings = all.filter((outing) => outing.status === "active");

  return (
    <>
      <PageHeader
        title="Rolês"
        description="Os rolês em andamento de que você participa."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/roles/novo">Novo rolê</Link>
            </Button>
          ) : undefined
        }
      />
      {outings.length === 0 ? (
        <div className="card-surface flex flex-col items-start gap-3 p-6">
          <p className="text-sm text-muted-foreground">
            {canCreate ? "Você ainda não tem rolês. Crie o primeiro para começar a dividir." : "Você ainda não participa de nenhum rolê."}
          </p>
          {canCreate && (
            <Button asChild>
              <Link href="/roles/novo">Criar rolê</Link>
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {outings.map((outing) => (
            <li key={outing.id}>
              <Link href={`/roles/${outing.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{outing.name}</span>
                  {outing.role === "admin" && <span className="text-xs text-muted-foreground">Você organiza</span>}
                </span>
                <Pill>{kindLabels[outing.kind]}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function OutingsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <Outings />
    </Suspense>
  );
}
