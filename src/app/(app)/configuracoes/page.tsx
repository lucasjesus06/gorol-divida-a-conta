import { ChevronRight, KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { isSuperAdmin } from "@/server/access";
import { getIdentity } from "@/server/auth";

export const metadata: Metadata = {
  title: "Configurações · GoRolê",
};

function SettingsLink({ href, icon, title, description }: { href: string; icon: ReactNode; title: string; description: string }) {
  return (
    <Link href={href} className="card-surface flex items-center gap-4 p-4 transition-colors hover:bg-accent/40">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary-glow">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="size-5 text-muted-foreground" />
    </Link>
  );
}

async function AdminLink() {
  const identity = await getIdentity();
  if (!identity || !(await isSuperAdmin(identity.userId))) {
    return null;
  }
  return (
    <SettingsLink
      href="/configuracoes/administracao"
      icon={<ShieldCheck className="size-5" />}
      title="Administração"
      description="Pedidos de acesso, convites e contas."
    />
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configurações" description="Seus dados e o funcionamento da sua conta." />
      <div className="flex flex-col gap-3">
        <SettingsLink
          href="/configuracoes/pix"
          icon={<KeyRound className="size-5" />}
          title="Chave Pix"
          description="É a chave que seus amigos usam para te pagar."
        />
        <Suspense fallback={null}>
          <AdminLink />
        </Suspense>
      </div>
    </>
  );
}
