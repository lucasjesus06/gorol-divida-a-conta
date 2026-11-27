import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/domain-error";
import { formatCents } from "@/domain/money";
import { cn } from "@/lib/utils";
import { isUuid } from "@/lib/uuid";
import { getRelationDetail } from "@/server/balances";
import { getRenderProfile } from "@/server/auth";

export const metadata: Metadata = {
  title: "Relação · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const payLink = (outingId: string, otherId: string, cents: number) =>
  `/roles/${outingId}?visao=pagamentos&para=${otherId}&valor=${(Math.abs(cents) / 100).toFixed(2).replace(".", ",")}`;

async function Detail({ params }: Pick<PageProps<"/resumo/[personId]">, "params">) {
  const { personId: otherId } = await params;
  if (!isUuid(otherId)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let detail;
  try {
    detail = await getRelationDetail(profile.personId, otherId);
  } catch (error) {
    if (error instanceof DomainError && error.code === "person_not_found") {
      notFound();
    }
    throw error;
  }

  const total = detail.netCents;
  const iOwe = detail.byOuting.filter((item) => item.netCents < 0);

  return (
    <>
      <PageHeader title={detail.name} backHref="/resumo" />
      <div className="flex flex-col gap-8">
        <section className="card-surface flex flex-col gap-2 p-5">
          {total === null ? (
            <p className="text-sm text-muted-foreground">
              {detail.name} participa como convidado: as dívidas ficam dentro de cada rolê e precisam ser acertadas ali, ou a pessoa cria um cadastro.
            </p>
          ) : (
            <>
              <h2 className="text-lg font-bold">{total < 0 ? `Você deve a ${detail.name}` : total > 0 ? `${detail.name} deve a você` : "Vocês estão em dia"}</h2>
              {total !== 0 && <p className="text-3xl font-extrabold">{formatCents(Math.abs(total))}</p>}
              <p className="text-sm text-muted-foreground">A soma de todos os rolês que vocês dividem: o que um deve num rolê abate o que o outro deve em outro.</p>
            </>
          )}
          {total !== null && total < 0 && iOwe[0] && (
            <Button asChild className="self-start">
              <Link href={payLink(iOwe[0].outingId, detail.otherId, total)}>Pagar o total</Link>
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">De onde vem</h2>
          <ul className="flex flex-col gap-2">
            {detail.byOuting.map((item) => (
              <li key={item.outingId} className="card-surface flex items-center justify-between gap-3 p-4">
                <span className="flex min-w-0 flex-col">
                  <Link href={`/roles/${item.outingId}?visao=acertos`} className="truncate font-semibold hover:underline">
                    {item.outingName}
                  </Link>
                  <span className="text-xs text-muted-foreground">{item.netCents < 0 ? "Você deve neste rolê" : "Deve a você neste rolê"}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className={cn("font-bold", item.netCents < 0 ? "text-destructive" : "text-primary-glow")}>{formatCents(Math.abs(item.netCents))}</span>
                  {item.netCents < 0 && (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={payLink(item.outingId, detail.otherId, item.netCents)}>Pagar este rolê</Link>
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Histórico</h2>
          <ul className="flex flex-col gap-2">
            {detail.entries.map((entry) => (
              <li key={`${entry.kind}-${entry.kind === "expense" ? entry.expenseId : entry.paymentId}`} className="card-surface flex items-center justify-between gap-3 p-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold">{entry.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.outingName} · {dateFormat.format(entry.occurredAt)}
                    {entry.kind === "payment" && entry.status === "declared" ? " · aguardando confirmação" : ""}
                  </span>
                </span>
                {entry.kind === "payment" && <Pill>Pagamento</Pill>}
                <span className={cn("font-bold", entry.effectCents < 0 ? "text-destructive" : "text-primary-glow")}>
                  {entry.effectCents < 0 ? "−" : "+"}
                  {formatCents(Math.abs(entry.effectCents))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

export default function RelationPage(props: PageProps<"/resumo/[personId]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
