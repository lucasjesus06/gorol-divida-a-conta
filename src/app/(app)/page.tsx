import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { signOut } from "@/app/login/actions";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { getRenderProfile } from "@/server/auth";
import { InstallApp } from "./install-app";

async function Greeting() {
  const profile = await getRenderProfile();
  return <p className="text-sm text-muted-foreground">Olá, {profile.displayName}.</p>;
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
      <div className="mt-8">
        <InstallApp />
      </div>
    </Shell>
  );
}
