import type { Metadata } from "next";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { getGuestAccessRequest, getGuestSummary } from "@/server/access";
import { getIdentity } from "@/server/auth";
import { GuestRequestForm } from "./guest-form";
import { RequestForm } from "./request-form";

export const metadata: Metadata = {
  title: "Pedir acesso · GoRolê",
};

async function RequestGate() {
  const identity = await getIdentity();
  if (identity?.kind !== "guest") {
    return <RequestForm />;
  }

  const [summary, request] = await Promise.all([getGuestSummary(identity.userId), getGuestAccessRequest(identity.userId)]);
  if (request?.status === "pending") {
    return <p className="text-sm">O seu pedido de cadastro já foi enviado e está aguardando aprovação.</p>;
  }
  return summary ? <GuestRequestForm name={summary.name} phone={summary.phone} /> : <RequestForm />;
}

export default function RequestAccessPage() {
  return (
    <Shell center>
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Pedir acesso</h1>
          <p className="text-sm text-muted-foreground">
            Para criar rolês e manter o seu histórico é preciso ter conta, e as contas são liberadas por aprovação.
          </p>
        </div>
        <div className="card-surface relative p-6">
          <Suspense fallback={null}>
            <RequestGate />
          </Suspense>
        </div>
      </section>
    </Shell>
  );
}
