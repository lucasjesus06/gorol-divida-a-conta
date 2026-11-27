import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { getRenderProfile } from "@/server/auth";
import { isApprovedPerson } from "@/server/access";
import { OutingForm } from "./outing-form";

export const metadata: Metadata = {
  title: "Novo rolê · GoRolê",
};

async function NewOutingGate() {
  const profile = await getRenderProfile();
  if (!(await isApprovedPerson(profile.personId))) {
    return <p className="text-sm">Só quem tem conta aprovada cria rolês.</p>;
  }
  return <OutingForm />;
}

export default function NewOutingPage() {
  return (
    <>
      <PageHeader title="Novo rolê" backHref="/roles" />
      <div className="card-surface p-6">
        <Suspense fallback={null}>
          <NewOutingGate />
        </Suspense>
      </div>
    </>
  );
}
