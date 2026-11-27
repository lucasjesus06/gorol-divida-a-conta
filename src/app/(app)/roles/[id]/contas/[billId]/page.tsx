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
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getBill } from "@/server/bills";
import { listPayers } from "@/server/expenses";
import { ClaimForm, CloseBillForm, LeftoverAnswer } from "./bill-controls";

export const metadata: Metadata = {
  title: "Conta · GoRolê",
};

const statusLabels = { open: "Aberta", closing: "Aguardando aceite", closed: "Fechada" } as const;

async function BillContent({ params }: Pick<PageProps<"/roles/[id]/contas/[billId]">, "params">) {
  const { id, billId } = await params;
  if (!isUuid(id) || !isUuid(billId)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let bill;
  let people;
  try {
    [bill, people] = await Promise.all([getBill(profile.personId, id, billId), listPayers(profile.personId, id)]);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "outing_not_found" || error.code === "bill_not_found")) {
      notFound();
    }
    throw error;
  }

  const everyone = people.map((person) => ({ personId: person.personId, name: person.name }));
  const hasLeftover = bill.items.some((item) => item.remaining !== "0");
  const open = bill.status === "open";

  return (
    <>
      <PageHeader title={bill.description} backHref={`/roles/${id}?visao=despesas`} actions={<Pill>{statusLabels[bill.status]}</Pill>} />
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">
          {formatCents(bill.totalCents)} no total
          {bill.serviceChargeCents > 0 ? `, com taxa de ${formatCents(bill.serviceChargeCents)}` : ""} · pago por{" "}
          {bill.payers.map((payer) => payer.name).join(", ")}
        </p>

        {bill.mustAcceptLeftover && (
          <div className="card-surface flex flex-col gap-3 p-5">
            <p className="text-sm">
              {bill.openedBy.name} transferiu para você a parte da conta que ninguém marcou. Você aceita assumir essa parte?
            </p>
            <LeftoverAnswer outingId={id} billId={billId} canAccept />
          </div>
        )}
        {bill.status === "closing" && !bill.mustAcceptLeftover && (
          <div className="card-surface flex flex-col gap-3 p-5">
            <p className="text-sm">Aguardando {bill.leftoverTo?.name} aceitar a parte que ninguém marcou.</p>
            {bill.canClose && <LeftoverAnswer outingId={id} billId={billId} canAccept={false} />}
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {bill.items.map((item) => {
            const mine = item.claims.find((claim) => claim.personId === profile.personId);
            return (
              <li key={item.id} className="card-surface flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">
                    {item.description}
                    {item.quantity !== "1" && <span className="ml-2 text-xs font-normal text-muted-foreground">x{item.quantity}</span>}
                  </span>
                  <span className="font-bold">{formatCents(item.totalCents)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.claims.length === 0 ? "Ninguém marcou ainda" : item.claims.map((claim) => `${claim.name} (${claim.quantity})`).join(", ")}
                  {item.remaining !== "0" ? ` · sobra ${item.remaining}` : " · tudo marcado"}
                </p>
                {open && <ClaimForm outingId={id} billId={billId} itemId={item.id} people={everyone} me={profile.personId} myQuantity={mine?.quantity ?? null} />}
              </li>
            );
          })}
        </ul>

        {open && bill.canClose && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Fechar a conta</h2>
            <div className="card-surface p-5">
              <CloseBillForm outingId={id} billId={billId} people={everyone} me={profile.personId} hasLeftover={hasLeftover} />
            </div>
          </section>
        )}
        {bill.status === "closed" && bill.resultExpenseId && (
          <Button asChild variant="secondary">
            <Link href={`/roles/${id}/despesas/${bill.resultExpenseId}`}>Ver quanto cada um assume</Link>
          </Button>
        )}
      </div>
    </>
  );
}

export default function BillPage(props: PageProps<"/roles/[id]/contas/[billId]">) {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <BillContent params={props.params} />
    </Suspense>
  );
}
