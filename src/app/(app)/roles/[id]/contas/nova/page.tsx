import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { listPayers } from "@/server/expenses";
import { BillForm } from "./bill-form";

export const metadata: Metadata = {
  title: "Nova conta por consumo · GoRolê",
};

async function NewBill({ params }: Pick<PageProps<"/roles/[id]/contas/nova">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const profile = await getRenderProfile();

  let people;
  try {
    people = await listPayers(profile.personId, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "outing_not_found") {
      notFound();
    }
    throw error;
  }
  const payers = people.filter((person) => person.isPayer);
  const canOpen = payers.some((person) => person.personId === profile.personId);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PageHeader
        title="Nova conta por consumo"
        description="Cada um marca o que consumiu. O que ninguém marcar é dividido entre todos ao fechar."
        backHref={`/roles/${id}?visao=despesas`}
      />
      <div className="card-surface p-6">
        {canOpen ? (
          <BillForm outingId={id} me={profile.personId} payers={payers} today={today} idempotencyKey={crypto.randomUUID()} />
        ) : (
          <p className="text-sm">Só o dono do rolê e os pagantes declarados abrem uma conta.</p>
        )}
      </div>
    </>
  );
}

export default function NewBillPage(props: PageProps<"/roles/[id]/contas/nova">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <NewBill params={props.params} />
    </Suspense>
  );
}
