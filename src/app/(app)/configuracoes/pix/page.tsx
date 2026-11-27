import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireAccount } from "@/server/auth";
import { getMyPixKey } from "@/server/pix";
import { loadProfile } from "@/server/profiles";
import { PixForm } from "./pix-form";

export const metadata: Metadata = {
  title: "Chave Pix · GoRolê",
};

async function PixContent() {
  const identity = await requireAccount();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect("/perfil");
  }
  const current = await getMyPixKey(profile.personId);
  return (
    <div className="flex flex-col gap-4">
      {!current && (
        <p className="text-sm text-muted-foreground">
          Para usar o GoRolê você precisa de uma chave Pix cadastrada: é para ela que seus amigos pagam o que devem.
        </p>
      )}
      <PixForm current={current ? { type: current.type, value: current.display } : null} />
    </div>
  );
}

export default function PixPage() {
  return (
    <>
      <PageHeader
        title="Chave Pix"
        description="Só quem te deve dinheiro vê essa chave, e apenas na hora de pagar."
        backHref="/configuracoes"
      />
      <div className="card-surface p-6">
        <Suspense fallback={null}>
          <PixContent />
        </Suspense>
      </div>
    </>
  );
}
