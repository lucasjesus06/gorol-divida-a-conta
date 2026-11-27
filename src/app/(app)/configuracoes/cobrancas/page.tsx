import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireSuperAdmin } from "@/server/auth";
import { getChargeQueue, getTemplates, type ChargeItem } from "@/server/charges";
import { ChargeCard, type ChargeCardItem } from "./charge-card";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = {
  title: "Cobranças · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const PAUSE_AVAILABLE_AFTER = 3;

const waitReasons = {
  paused: "Em pausa",
  min_interval: "Cobrado há pouco",
  outside_window: "Fora do horário de envio",
} as const;

function toCard(item: ChargeItem): ChargeCardItem {
  const base = {
    debtorId: item.debtor.id,
    debtorName: item.debtor.name,
    creditorId: item.creditor.id,
    creditorName: item.creditor.name,
    amountCents: item.amountCents,
    outingNames: item.outingNames,
    sentCount: item.sentCount,
    pausesUsed: item.pausesUsed,
  };
  const { decision } = item;
  if (decision.action === "send") {
    return { ...base, status: { kind: "send", message: item.message ?? "", whatsappUrl: item.whatsappUrl, canPause: item.sentCount >= PAUSE_AVAILABLE_AFTER && decision.offerPause } };
  }
  if (decision.action === "wait") {
    return { ...base, status: { kind: "wait", label: `${waitReasons[decision.reason]}: pode cobrar de novo a partir de ${dateFormat.format(decision.until)}.` } };
  }
  return {
    ...base,
    status: { kind: "hold", label: decision.action === "hold" ? "Contestação aberta: cobrança suspensa até a decisão." : "Esta pessoa ainda não aceitou os termos." },
  };
}

async function ChargesContent() {
  await requireSuperAdmin();
  const [queue, templates] = await Promise.all([getChargeQueue(), getTemplates()]);
  const ready = queue.filter((item) => item.decision.action === "send");
  const others = queue.filter((item) => item.decision.action !== "send");

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Para cobrar agora</h2>
        {ready.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted-foreground">Ninguém para cobrar agora.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {ready.map((item) => (
              <ChargeCard key={`${item.debtor.id}-${item.creditor.id}`} item={toCard(item)} />
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">Aguardando</h2>
          <ul className="flex flex-col gap-3">
            {others.map((item) => (
              <ChargeCard key={`${item.debtor.id}-${item.creditor.id}`} item={toCard(item)} />
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Textos das mensagens</h2>
        <div className="card-surface p-5">
          <TemplateEditor initial={templates} />
        </div>
      </section>
    </div>
  );
}

export default function ChargesPage() {
  return (
    <>
      <PageHeader title="Cobranças" description="Quem deve e já pode ser cobrado, com a mensagem pronta para o WhatsApp." backHref="/configuracoes" />
      <Suspense fallback={null}>
        <ChargesContent />
      </Suspense>
    </>
  );
}
