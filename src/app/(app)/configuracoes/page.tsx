import { Bell, ChevronRight, HandCoins, KeyRound, ShieldCheck, ShieldHalf, SlidersHorizontal, UserRound, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { isSuperAdmin } from "@/server/access";
import { requireReadyAccount } from "@/server/auth";

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

async function SettingsContent() {
  const { identity } = await requireReadyAccount();
  const isAdmin = await isSuperAdmin(identity.userId);

  return (
    <div className="flex flex-col gap-3">
      <SettingsLink
        href="/configuracoes/perfil"
        icon={<UserRound className="size-5" />}
        title="Perfil"
        description="Foto e como você quer ser chamado."
      />
      <SettingsLink
        href="/configuracoes/pix"
        icon={<KeyRound className="size-5" />}
        title="Chave Pix"
        description="É a chave que seus amigos usam para te pagar."
      />
      <SettingsLink
        href="/configuracoes/avisos"
        icon={<Bell className="size-5" />}
        title="Avisos no aparelho"
        description="Ligue para ser avisado no celular."
      />
      <SettingsLink
        href="/configuracoes/despesas-compartilhadas"
        icon={<Users className="size-5" />}
        title="Despesas compartilhadas"
        description="Para quem divide o mesmo dinheiro, como cônjuges."
      />
      <SettingsLink
        href="/configuracoes/privacidade"
        icon={<ShieldHalf className="size-5" />}
        title="Privacidade"
        description="Termos aceitos e lembretes de pagamento."
      />
      {isAdmin && (
        <>
          <SettingsLink
            href="/configuracoes/administracao"
            icon={<ShieldCheck className="size-5" />}
            title="Administração"
            description="Pedidos de acesso, convites e contas."
          />
          <SettingsLink
            href="/configuracoes/cobrancas"
            icon={<HandCoins className="size-5" />}
            title="Cobranças"
            description="Quem deve, mensagens prontas e textos."
          />
          <SettingsLink
            href="/configuracoes/parametros"
            icon={<SlidersHorizontal className="size-5" />}
            title="Parâmetros"
            description="Prazos e regras do sistema, com histórico."
          />
        </>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Configurações" description="Seus dados e o funcionamento da sua conta." />
      <Suspense fallback={null}>
        <SettingsContent />
      </Suspense>
    </>
  );
}
