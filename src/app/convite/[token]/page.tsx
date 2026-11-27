import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { inviteIsUsable } from "@/server/access";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = {
  title: "Convite · GoRolê",
};

async function InviteGate({ params }: Pick<PageProps<"/convite/[token]">, "params">) {
  const { token } = await params;
  if (!(await inviteIsUsable(token))) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">Este convite não vale mais. Peça outro a quem te convidou.</p>
        <Button asChild variant="secondary">
          <Link href="/login">Ir para a entrada</Link>
        </Button>
      </div>
    );
  }
  return <InviteForm token={token} />;
}

export default function InvitePage(props: PageProps<"/convite/[token]">) {
  return (
    <Shell>
      <section className="mt-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Você foi convidado</h1>
          <p className="text-sm text-muted-foreground">Preencha os dados abaixo para criar a sua conta.</p>
        </div>
        <div className="card-surface p-6">
          <Suspense fallback={null}>
            <InviteGate params={props.params} />
          </Suspense>
        </div>
      </section>
    </Shell>
  );
}
