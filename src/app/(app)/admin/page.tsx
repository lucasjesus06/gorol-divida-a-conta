import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { inviteState } from "@/domain/access";
import { listAccessRequests, listAccounts, listInvites } from "@/server/access";
import { requireSuperAdmin } from "@/server/auth";
import { InviteCreator, RequestCard } from "./admin-panel";

export const metadata: Metadata = {
  title: "Administração · GoRolê",
};

const inviteLabels = { usable: "Aguardando uso", used: "Usado", expired: "Vencido" } as const;
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function AdminContent() {
  await requireSuperAdmin();
  const [requests, invites, accounts] = await Promise.all([listAccessRequests(), listInvites(), listAccounts()]);
  const pending = requests.filter((request) => request.status === "pending");
  const now = new Date();

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Pedidos de acesso</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pedido esperando.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((request) => (
              <RequestCard
                key={request.id}
                request={{
                  id: request.id,
                  name: request.name,
                  email: request.email,
                  phone: request.phone,
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Convites</h2>
        <InviteCreator />
        <ul className="flex flex-col gap-2">
          {invites.map((invite) => (
            <li key={invite.id} className="card-surface flex items-center justify-between p-3 text-sm">
              <span>{dateFormat.format(invite.createdAt)}</span>
              <span className="text-muted-foreground">{inviteLabels[inviteState(invite, now)]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Contas aprovadas</h2>
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li key={account.id} className="card-surface flex items-center justify-between p-3 text-sm">
              <span className="font-medium">{account.displayName}</span>
              <span className="text-muted-foreground">{account.phone}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Administração" description="Pedidos de acesso, convites e contas." />
      <Suspense fallback={null}>
        <AdminContent />
      </Suspense>
    </>
  );
}
