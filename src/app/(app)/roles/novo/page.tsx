import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
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
    <Shell
      back={
        <Button asChild variant="ghost" size="icon" aria-label="Voltar" title="Voltar">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
      }
      hideLogo
    >
      <h1 className="mt-4 mb-6 text-3xl font-extrabold tracking-tight">Novo rolê</h1>
      <div className="card-surface p-6">
        <Suspense fallback={null}>
          <NewOutingGate />
        </Suspense>
      </div>
    </Shell>
  );
}
