import { LogOut } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/common/Pill";
import { isApprovedPerson, isSuperAdmin } from "@/server/access";
import { getIdentity, getRenderProfile } from "@/server/auth";
import { listOutings } from "@/server/outings";
import { InstallApp } from "./install-app";

async function Greeting() {
  const profile = await getRenderProfile();
  return <p className="text-sm text-muted-foreground">Olá, {profile.displayName}.</p>;
}

async function AdminLink() {
  const identity = await getIdentity();
  if (!identity || !(await isSuperAdmin(identity.userId))) {
    return null;
  }
  return (
    <Button asChild variant="secondary">
      <Link href="/admin">Administração</Link>
    </Button>
  );
}

const kindLabels = { event: "Pontual", recurring: "Recorrente" } as const;

async function Outings() {
  const profile = await getRenderProfile();
  const [outings, canCreate] = await Promise.all([listOutings(profile.personId), isApprovedPerson(profile.personId)]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Seus rolês</h2>
        {canCreate && (
          <Button asChild size="sm">
            <Link href="/roles/novo">Novo rolê</Link>
          </Button>
        )}
      </div>
      {outings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {canCreate ? "Você ainda não tem rolês. Crie o primeiro." : "Você ainda não participa de nenhum rolê."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {outings.map((outing) => (
            <li key={outing.id}>
              <Link href={`/roles/${outing.id}`} className="card-surface flex items-center justify-between gap-3 p-4">
                <span className="truncate font-semibold">{outing.name}</span>
                <Pill>{outing.status === "closed" ? "Encerrado" : kindLabels[outing.kind]}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function GuestNotice() {
  const identity = await getIdentity();
  if (identity?.kind !== "guest") {
    return null;
  }
  return (
    <div className="card-surface flex flex-col gap-3 p-4">
      <p className="text-sm">Você entrou como convidado. Quer ter conta e instalar o app para uma experiência completa?</p>
      <Button asChild variant="secondary">
        <Link href="/pedir-acesso">Pedir acesso</Link>
      </Button>
    </div>
  );
}

export default function HomePage() {
  return (
    <Shell
      right={
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="icon" aria-label="Sair" title="Sair">
            <LogOut />
          </Button>
        </form>
      }
    >
      <section className="mt-4 animate-fade-up">
        <h1 className="text-gradient-primary text-[40px] leading-[1.05] font-extrabold tracking-tight">GoRolê</h1>
        <div className="mt-4">
          <Suspense fallback={null}>
            <Greeting />
          </Suspense>
        </div>
        <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
          Divida as despesas do rolê, veja quem deve a quem e acerte com o menor número de Pix.
        </p>
      </section>
      <div className="mt-8 flex flex-col gap-6">
        <Suspense fallback={null}>
          <GuestNotice />
        </Suspense>
        <Suspense fallback={null}>
          <Outings />
        </Suspense>
        <Suspense fallback={null}>
          <AdminLink />
        </Suspense>
        <InstallApp />
      </div>
    </Shell>
  );
}
