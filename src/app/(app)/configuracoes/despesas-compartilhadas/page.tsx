import type { Metadata } from "next";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireReadyAccount } from "@/server/auth";
import { getMyFund, listFundCandidates } from "@/server/shared-funds";
import { AnswerFundForm, EndFundForm, RequestFundForm } from "./fund-forms";

export const metadata: Metadata = {
  title: "Despesas compartilhadas · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

async function FundContent() {
  const { profile } = await requireReadyAccount();
  const fund = await getMyFund(profile.personId);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Para quem divide o mesmo dinheiro, como cônjuges. Entre vocês dois não há dívida, Pix nem pagamento. Com os outros participantes nada muda: a divisão do rolê continua a mesma para todos.
      </p>

      {!fund && (
        <section className="card-surface flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">Declarar</h2>
          <p className="text-sm text-muted-foreground">
            A outra pessoa precisa aceitar. Ao aceitar, o que havia entre vocês é perdoado no ato, só entre vocês dois. Você pode desfazer quando quiser, e o que foi lançado até lá continua como estava.
          </p>
          <Candidates personId={profile.personId} />
        </section>
      )}

      {fund?.status === "pending" && fund.requestedByMe && (
        <section className="card-surface flex flex-col gap-2 p-5">
          <h2 className="text-lg font-bold">Aguardando {fund.other.name}</h2>
          <p className="text-sm text-muted-foreground">{fund.other.name} foi avisado(a) e precisa aceitar para valer.</p>
        </section>
      )}

      {fund?.status === "pending" && !fund.requestedByMe && (
        <section className="card-surface flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">{fund.other.name} quer declarar despesas compartilhadas</h2>
          <p className="text-sm text-muted-foreground">
            Se você aceitar, não haverá dívida entre vocês daqui em diante, e o que havia entre vocês é perdoado agora. Com os outros participantes, nada muda. Os dois ficam sabendo que isso aparece nos rolês que dividem.
          </p>
          <AnswerFundForm fundId={fund.id} />
        </section>
      )}

      {fund?.status === "active" && (
        <section className="card-surface flex flex-col gap-4 p-5">
          <h2 className="text-lg font-bold">Você e {fund.other.name} dividem as despesas</h2>
          <p className="text-sm text-muted-foreground">
            Desde {fund.acceptedAt ? dateFormat.format(fund.acceptedAt) : "agora"}. Nos rolês que vocês dividem, a rota de acerto não manda um pagar o outro, e só vocês dois veem estes detalhes.
          </p>
          <EndFundForm fundId={fund.id} />
        </section>
      )}
    </div>
  );
}

async function Candidates({ personId }: { personId: string }) {
  const candidates = await listFundCandidates(personId);
  return candidates.length === 0 ? (
    <p className="text-sm">Ainda não há ninguém com conta nos seus rolês para declarar.</p>
  ) : (
    <RequestFundForm candidates={candidates} />
  );
}

export default function SharedExpensesPage() {
  return (
    <>
      <PageHeader title="Despesas compartilhadas" backHref="/configuracoes" />
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <FundContent />
      </Suspense>
    </>
  );
}
