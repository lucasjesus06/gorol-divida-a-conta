import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { StatCard } from "@/components/common/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { isApprovedPerson, isSuperAdmin, listAccessRequests } from "@/server/access";
import { getIdentity, getRenderProfile } from "@/server/auth";
import { countPendingJoinRequests } from "@/server/join";
import { listOutings } from "@/server/outings";
import { InstallApp } from "./install-app";

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;
const RECENT_OUTINGS = 5;

async function Dashboard() {
  const profile = await getRenderProfile();
  const identity = await getIdentity();
  const [outings, canCreate, pendingJoins, admin] = await Promise.all([
    listOutings(profile.personId),
    isApprovedPerson(profile.personId),
    countPendingJoinRequests(profile.personId),
    identity ? isSuperAdmin(identity.userId) : false,
  ]);
  const pendingAccess = admin ? (await listAccessRequests()).filter((request) => request.status === "pending").length : 0;
  const active = outings.filter((outing) => outing.status === "active");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={`Olá, ${profile.displayName.split(" ")[0]}`}
        description="Um resumo do que está acontecendo nos seus rolês."
        actions={
          canCreate ? (
            <Button asChild size="sm">
              <Link href="/roles/novo">Novo rolê</Link>
            </Button>
          ) : undefined
        }
      />

      {identity?.kind === "guest" && (
        <div className="card-surface flex flex-col gap-3 p-4">
          <p className="text-sm">Você entrou como convidado. Quer ter conta e instalar o app para uma experiência completa?</p>
          <Button asChild variant="secondary">
            <Link href="/pedir-acesso">Pedir acesso</Link>
          </Button>
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Rolês ativos" value={active.length} href="/roles" />
        <StatCard label="Pedidos para aprovar" value={pendingJoins} href="/roles" highlight={pendingJoins > 0} />
        {admin && <StatCard label="Pedidos de acesso" value={pendingAccess} href="/admin" highlight={pendingAccess > 0} />}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Seus rolês</h2>
          {outings.length > RECENT_OUTINGS && (
            <Link href="/roles" className="text-sm font-semibold text-primary-glow hover:underline">
              Ver todos
            </Link>
          )}
        </div>
        {outings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canCreate ? "Você ainda não tem rolês. Crie o primeiro." : "Você ainda não participa de nenhum rolê."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {outings.slice(0, RECENT_OUTINGS).map((outing) => (
              <li key={outing.id}>
                <Link href={`/roles/${outing.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                  <span className="truncate font-semibold">{outing.name}</span>
                  <Pill>{outing.status === "closed" ? "Encerrado" : kindLabels[outing.kind]}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<ListSkeleton />}>
        <Dashboard />
      </Suspense>
      <InstallApp />
    </div>
  );
}
