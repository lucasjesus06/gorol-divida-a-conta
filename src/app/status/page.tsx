import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { checkDatabase } from "@/server/health";

export const metadata: Metadata = {
  title: "Status · GoRolê",
};

async function DatabaseStatus() {
  await connection();
  const health = await checkDatabase();

  if (health.status === "error") {
    return <p className="text-destructive">Banco de dados indisponível</p>;
  }

  return (
    <p>
      Banco de dados conectado · {health.people} {health.people === 1 ? "pessoa" : "pessoas"}
    </p>
  );
}

export default function StatusPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">Status</h1>
      <section className="rounded-2xl border bg-card p-5 text-sm text-card-foreground">
        <Suspense fallback={<p className="text-muted-foreground">Verificando banco de dados…</p>}>
          <DatabaseStatus />
        </Suspense>
      </section>
    </main>
  );
}
