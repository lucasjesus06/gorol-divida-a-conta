import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { listPayers } from "@/server/expenses";
import { getEffectiveSettings } from "@/server/outing-settings";
import { BillForm } from "./bill-form";

export const metadata: Metadata = {
  title: "Nova conta · GoRolê",
};

async function NewBill({ params }: Pick<PageProps<"/roles/[id]/contas/nova">, "params">) {
  const { id } = await params;
  if (!isUuid(id)) {
    notFound();
  }
  const profile = await getRenderProfile();
  try {
    await listPayers(profile.personId, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "outing_not_found") {
      notFound();
    }
    throw error;
  }
  const settings = await getEffectiveSettings(id);

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PageHeader
        title="Nova conta"
        description="Lance só o valor ou abra uma conta com itens. Quem pagou e a divisão ficam para o fechamento."
        backHref={`/roles/${id}?visao=despesas`}
      />
      <div className="card-surface p-6">
        <BillForm outingId={id} today={today} idempotencyKey={crypto.randomUUID()} serviceFeePercent={settings.serviceFeePercent} />
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
