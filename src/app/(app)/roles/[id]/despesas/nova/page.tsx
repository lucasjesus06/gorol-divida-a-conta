import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { getEffectiveSettings } from "@/server/outing-settings";
import { listPayers } from "@/server/expenses";
import { ExpenseForm } from "../expense-form";

export const metadata: Metadata = {
  title: "Nova despesa · GoRolê",
};

async function NewExpense({ params }: Pick<PageProps<"/roles/[id]/despesas/nova">, "params">) {
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
  const settings = await getEffectiveSettings(id);
  const canRegister = people.find((person) => person.personId === profile.personId)?.isPayer === true;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

  return (
    <>
      <PageHeader title="Nova despesa" backHref={`/roles/${id}?visao=despesas`} />
      <div className="card-surface p-6">
        {canRegister ? (
          <ExpenseForm
            outingId={id}
            me={profile.personId}
            idempotencyKey={crypto.randomUUID()}
            people={people}
            defaults={{ description: "", total: "", date: today, method: settings.defaultSplit, payers: {}, shares: {} }}
          />
        ) : (
          <p className="text-sm">Só o dono do rolê e os pagantes declarados registram despesas.</p>
        )}
      </div>
    </>
  );
}

export default function NewExpensePage(props: PageProps<"/roles/[id]/despesas/nova">) {
  return (
    <Suspense fallback={<ListSkeleton rows={2} />}>
      <NewExpense params={props.params} />
    </Suspense>
  );
}
