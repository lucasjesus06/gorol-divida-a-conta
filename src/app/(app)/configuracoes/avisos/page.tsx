import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { connection } from "next/server";
import { requireReadyAccount } from "@/server/auth";
import { pushIsConfigured } from "@/server/push";
import { DeviceSwitch } from "./device-switch";

export const metadata: Metadata = {
  title: "Avisos no aparelho · GoRolê",
};

async function DeviceSettings() {
  await requireReadyAccount();
  await connection();
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pushIsConfigured() || !publicKey) {
    return <p className="text-sm text-muted-foreground">Os avisos no aparelho ainda não estão disponíveis. Os avisos continuam aparecendo na lista de Avisos.</p>;
  }
  return <DeviceSwitch publicKey={publicKey} />;
}

export default function DeviceNoticesPage() {
  return (
    <>
      <PageHeader title="Avisos no aparelho" description="Receba um aviso no celular quando algo precisar de você." backHref="/configuracoes" />
      <div className="card-surface p-6">
        <Suspense fallback={null}>
          <DeviceSettings />
        </Suspense>
      </div>
    </>
  );
}
