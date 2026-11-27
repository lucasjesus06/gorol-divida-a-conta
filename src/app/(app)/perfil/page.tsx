import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { requireAccount } from "@/server/auth";
import { loadProfile } from "@/server/profiles";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Seu cadastro · GoRolê",
};

async function ProfileGate() {
  const identity = await requireAccount();
  if (await loadProfile(identity.userId)) {
    redirect("/");
  }
  return <ProfileForm />;
}

export default function ProfilePage() {
  return (
    <Shell>
      <section className="mt-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Seu cadastro</h1>
          <p className="text-sm text-muted-foreground">
            O telefone identifica você nos rolês: é por ele que quem organiza o rolê te encontra.
          </p>
        </div>
        <div className="card-surface p-6">
          <Suspense fallback={null}>
            <ProfileGate />
          </Suspense>
        </div>
      </section>
    </Shell>
  );
}
