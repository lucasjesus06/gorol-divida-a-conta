import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { Pill } from "@/components/common/Pill";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileList } from "@/components/files/FileList";
import { FileUploader } from "@/components/files/FileUploader";
import { Button } from "@/components/ui/button";
import { DomainError } from "@/domain/domain-error";
import { formatFileSize } from "@/domain/file-rules";
import { formatCents } from "@/domain/money";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getBill } from "@/server/bills";
import { listFiles } from "@/server/files";
import { listPayers } from "@/server/expenses";
import { AddItemForm, AmountsForm, ClaimForm, CloseBillForm, EditItemForm, LeftoverAnswer } from "./bill-controls";

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
  let documents;
  try {
    [bill, people, documents] = await Promise.all([getBill(profile.personId, id, billId), listPayers(profile.personId, id), listFiles(profile.personId, "bill_document", id, [billId])]);
  } catch (error) {
    if (error instanceof DomainError && (error.code === "outing_not_found" || error.code === "bill_not_found")) {
      notFound();
    }
    throw error;
  }

  const everyone = people.map((person) => ({ personId: person.personId, name: person.name }));
  const payerOptions = people.filter((person) => person.isPayer).map((person) => ({ personId: person.personId, name: person.name }));
  const cents = (value: number) => (value === 0 ? "" : (value / 100).toFixed(2).replace(".", ","));
  const hasLeftover = bill.items.some((item) => item.remaining !== "0");
  const open = bill.status === "open";

  return (
    <>
      <PageHeader title={bill.description} backHref={`/roles/${id}?visao=despesas`} actions={<Pill>{statusLabels[bill.status]}</Pill>} />
      <div className="flex flex-col gap-8">
        <p className="text-sm text-muted-foreground">
          {formatCents(bill.totalCents)} no total
          {bill.serviceChargeCents > 0 ? `, com taxa de ${formatCents(bill.serviceChargeCents)}` : ""}
          {bill.payers.length > 0 ? ` · pago por ${bill.payers.map((payer) => payer.name).join(", ")}` : ` · aberta por ${bill.openedBy.name}`}
        </p>

        {(documents.length > 0 || (bill.canClose && bill.status === "open")) && (
          <section className="flex flex-col gap-2">
            <FileList
              revalidate={`/roles/${id}/contas/${billId}`}
              files={documents.map((file) => ({ id: file.id, name: file.name, sizeLabel: formatFileSize(file.sizeBytes), canRemove: false }))}
            />
            {bill.canClose && bill.status === "open" && (
              <FileUploader kind="bill_document" outingId={id} subjectId={billId} label="Anexar a foto da nota" revalidate={`/roles/${id}/contas/${billId}`} />
            )}
          </section>
        )}

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

        {bill.mode === "detailed" && (
          <section className="flex flex-col gap-3">
            {bill.items.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há itens. Cada um lança o que consome, e o dono fecha no fim.</p>}
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
                      Lançado por {item.addedBy.name} ·{" "}
                      {item.claims.length === 0 ? "ninguém marcou ainda" : item.claims.map((claim) => `${claim.name} (${claim.quantity})`).join(", ")}
                      {item.remaining !== "0" ? ` · sobra ${item.remaining}` : " · tudo marcado"}
                    </p>
                    {open && <ClaimForm outingId={id} billId={billId} itemId={item.id} people={everyone} me={profile.personId} myQuantity={mine?.quantity ?? null} />}
                    {open && item.canEdit && (
                      <EditItemForm outingId={id} billId={billId} itemId={item.id} description={item.description} total={cents(item.totalCents)} quantity={item.quantity} />
                    )}
                  </li>
                );
              })}
            </ul>
            {open && bill.canAddItem && <AddItemForm outingId={id} billId={billId} />}
          </section>
        )}

        {open && bill.canClose && (
          <AmountsForm
            outingId={id}
            billId={billId}
            direct={bill.mode === "direct"}
            directTotal={cents(bill.totalCents)}
            serviceCharge={cents(bill.serviceChargeCents)}
            discount={cents(bill.discountCents)}
          />
        )}

        {open && bill.canClose && (
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">Fechar a conta</h2>
            <div className="card-surface p-5">
              <CloseBillForm outingId={id} billId={billId} people={everyone} payers={payerOptions} me={profile.personId} direct={bill.mode === "direct"} payersFixed={bill.payersFixed} hasLeftover={hasLeftover} />
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
