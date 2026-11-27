import Link from "next/link";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { StatCard } from "@/components/common/StatCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getGuestAccessRequest, isApprovedPerson, isSuperAdmin, listAccessRequests } from "@/server/access";
import { getIdentity, getRenderProfile } from "@/server/auth";
import { getRelations, relationTotals } from "@/server/balances";
import { countPendingJoinRequests } from "@/server/join";
import { listOutings } from "@/server/outings";
import { InstallApp } from "./install-app";

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;
const RECENT_OUTINGS = 5;

async function Dashboard() {
  const profile = await getRenderProfile();
  const identity = await getIdentity();
  const [outings, canCreate, pendingJoins, admin, relations] = await Promise.all([
    listOutings(profile.personId),
    isApprovedPerson(profile.personId),
    countPendingJoinRequests(profile.personId),
    identity ? isSuperAdmin(identity.userId) : false,
    getRelations(profile.personId),
  ]);
  const totals = relationTotals(relations);
  const guestRequest = identity?.kind === "guest" ? await getGuestAccessRequest(identity.userId) : null;
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
          {guestRequest?.status === "pending" ? (
            <p className="text-sm">Seu pedido de cadastro foi enviado e está aguardando aprovação.</p>
          ) : (
            <>
              <p className="text-sm">
                Você entrou como convidado. Crie o seu cadastro para manter o histórico dos seus rolês e das suas dívidas e ter a
                experiência completa. Sem cadastro, as dívidas precisam ser acertadas dentro do rolê.
              </p>
              <Button asChild>
                <Link href="/pedir-acesso">Criar cadastro</Link>
              </Button>
            </>
          )}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Você deve" value={totals.owe} money href="/resumo" highlight={totals.owe > 0} />
        <StatCard label="A receber" value={totals.receive} money href="/resumo" />
        <StatCard label="Rolês ativos" value={active.length} href="/roles" />
        <StatCard label="Pedidos para aprovar" value={pendingJoins} href="/roles" highlight={pendingJoins > 0} />
        {admin && <StatCard label="Pedidos de acesso" value={pendingAccess} href="/admin" highlight={pendingAccess > 0} />}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Seus rolês</h2>
          {active.length > RECENT_OUTINGS && (
            <Link href="/roles" className="text-sm font-semibold text-primary-glow hover:underline">
              Ver todos
            </Link>
          )}
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canCreate ? "Você não tem rolês em andamento. Crie um." : "Você não participa de nenhum rolê em andamento."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.slice(0, RECENT_OUTINGS).map((outing) => (
              <li key={outing.id}>
                <Link href={`/roles/${outing.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                  <span className="truncate font-semibold">{outing.name}</span>
                  <Pill>{kindLabels[outing.kind]}</Pill>
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
