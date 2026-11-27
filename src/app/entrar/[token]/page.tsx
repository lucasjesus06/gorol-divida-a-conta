import type { Metadata } from "next";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { getJoinPage } from "@/server/join";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Entrar no rolê · GoRolê",
};

async function JoinGate({ params }: Pick<PageProps<"/entrar/[token]">, "params">) {
  const { token } = await params;
  const page = await getJoinPage(token);
  if (!page) {
    return <p className="text-sm">Este link não vale mais. Peça outro a quem organiza o rolê.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Rolê: <span className="font-semibold text-foreground">{page.outingName}</span>
      </p>
      <JoinForm token={token} participants={page.participants} />
    </div>
  );
}

export default function JoinPage(props: PageProps<"/entrar/[token]">) {
  return (
    <Shell>
      <section className="mt-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Entrar no rolê</h1>
          <p className="text-sm text-muted-foreground">
            Escolha o seu nome na lista e confirme o telefone. Quem organiza o rolê precisa aprovar a sua entrada.
          </p>
        </div>
        <div className="card-surface p-6">
          <Suspense fallback={null}>
            <JoinGate params={props.params} />
          </Suspense>
        </div>
      </section>
    </Shell>
  );
}
