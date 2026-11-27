import type { Metadata } from "next";
import { Shell } from "@/components/layout/Shell";
import { RequestForm } from "./request-form";

export const metadata: Metadata = {
  title: "Pedir acesso · GoRolê",
};

export default function RequestAccessPage() {
  return (
    <Shell>
      <section className="mt-4 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Pedir acesso</h1>
          <p className="text-sm text-muted-foreground">
            Para criar rolês é preciso ter conta, e as contas são liberadas por aprovação. Quem só participa de um
            rolê não precisa disso.
          </p>
        </div>
        <div className="card-surface relative p-6">
          <RequestForm />
        </div>
      </section>
    </Shell>
  );
}
