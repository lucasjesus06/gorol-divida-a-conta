import type { Metadata } from "next";
import { Suspense } from "react";
import { TermsText } from "@/components/legal/TermsText";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { getRenderProfile } from "@/server/auth";
import { getAcceptance } from "@/server/terms";
import { restoreRemindersAction, withdrawRemindersAction } from "./actions";

export const metadata: Metadata = {
  title: "Privacidade · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

async function PrivacyContent() {
  const profile = await getRenderProfile();
  const acceptance = await getAcceptance(profile.personId);
  const withdrawn = acceptance?.remindersWithdrawnAt != null;

  return (
    <div className="flex flex-col gap-6">
      <section className="card-surface flex flex-col gap-3 p-6">
        <h2 className="text-lg font-bold">Lembretes de pagamento</h2>
        <p className="text-sm text-muted-foreground">
          {withdrawn
            ? "Você retirou o consentimento: não enviamos mais lembretes. A dívida continua registrada entre você e as outras pessoas."
            : "Você aceitou receber lembretes quando deve dinheiro a alguém. Se retirar, os lembretes param, mas a dívida continua registrada."}
        </p>
        {withdrawn ? (
          <form action={restoreRemindersAction}>
            <Button type="submit" variant="secondary">
              Voltar a receber lembretes
            </Button>
          </form>
        ) : (
          <form action={withdrawRemindersAction}>
            <Button type="submit" variant="secondary">
              Retirar consentimento dos lembretes
            </Button>
          </form>
        )}
      </section>
      <section className="card-surface flex flex-col gap-4 p-6">
        <h2 className="text-lg font-bold">Termos de uso</h2>
        {acceptance && <p className="text-sm text-muted-foreground">Aceitos em {dateFormat.format(acceptance.acceptedAt)} (versão {acceptance.version}).</p>}
        <TermsText />
      </section>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacidade" description="Seus termos e seus lembretes." backHref="/configuracoes" />
      <Suspense fallback={null}>
        <PrivacyContent />
      </Suspense>
    </>
  );
}
