import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TermsText } from "@/components/legal/TermsText";
import { PageHeader } from "@/components/layout/PageHeader";
import { requireAccount } from "@/server/auth";
import { loadProfile } from "@/server/profiles";
import { hasAcceptedTerms } from "@/server/terms";
import { TermsForm } from "./terms-form";

export const metadata: Metadata = {
  title: "Termos de uso · GoRolê",
};

// This page must not go through getRenderProfile: that call sends people without the acceptance here.
async function TermsContent() {
  const identity = await requireAccount();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect("/perfil");
  }
  if (await hasAcceptedTerms(profile.personId)) {
    redirect("/");
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="card-surface p-6">
        <TermsText />
      </div>
      <div className="card-surface p-6">
        <TermsForm />
      </div>
    </div>
  );
}

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Termos de uso" description="Leia com calma e aceite para continuar." />
      <Suspense fallback={null}>
        <TermsContent />
      </Suspense>
    </>
  );
}
