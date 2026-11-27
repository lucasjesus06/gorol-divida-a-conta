import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
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
    <>
      <PageHeader
        title="Seu cadastro"
        description="O telefone identifica você nos rolês: é por ele que quem organiza o rolê te encontra."
      />
      <div className="card-surface p-6">
        <Suspense fallback={null}>
          <ProfileGate />
        </Suspense>
      </div>
    </>
  );
}
