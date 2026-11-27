import type { Metadata } from "next";
import { Suspense } from "react";
import { Shell } from "@/components/layout/Shell";
import { safeNextPath } from "@/domain/navigation";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar · GoRolê",
};

async function LoginFormWithNext({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { next } = await searchParams;
  return <LoginForm next={safeNextPath(next)} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Shell>
      <section className="mt-4 flex flex-col gap-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Entrar</h1>
        <div className="card-surface p-6">
          <Suspense fallback={<LoginForm next="/" />}>
            <LoginFormWithNext searchParams={props.searchParams} />
          </Suspense>
        </div>
      </section>
    </Shell>
  );
}
