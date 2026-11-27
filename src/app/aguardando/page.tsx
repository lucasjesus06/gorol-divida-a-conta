import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { getGuestJoinStatus } from "@/server/join";
import { requireIdentity } from "@/server/auth";

export const metadata: Metadata = {
  title: "Aguardando aprovação · GoRolê",
};

async function Status() {
  const identity = await requireIdentity();
  const status = await getGuestJoinStatus(identity.userId);

  if (!status) {
    return <p className="text-sm">Você ainda não pediu para entrar em nenhum rolê. Abra o link que recebeu.</p>;
  }
  if (status.status === "approved") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">
          Você entrou no rolê {status.outingName}. Crie o seu cadastro agora para ter histórico: sem ele, as dívidas
          precisam ser acertadas dentro do rolê.
        </p>
        <Button asChild>
          <Link href="/pedir-acesso">Criar cadastro</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Ver meus rolês</Link>
        </Button>
      </div>
    );
  }
  if (status.status === "rejected") {
    return <p className="text-sm">O pedido para entrar em {status.outingName} não foi aprovado. Fale com quem organiza o rolê.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        Seu pedido para entrar em <span className="font-semibold">{status.outingName}</span> foi enviado. Assim que quem
        organiza o rolê aprovar, você entra.
      </p>
      <Button asChild variant="secondary">
        <Link href="/aguardando">Atualizar</Link>
      </Button>
    </div>
  );
}

export default function WaitingPage() {
  return (
    <Shell>
      <section className="mt-4 flex flex-col gap-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Aguardando aprovação</h1>
        <div className="card-surface p-6">
          <Suspense fallback={null}>
            <Status />
          </Suspense>
        </div>
      </section>
    </Shell>
  );
}
