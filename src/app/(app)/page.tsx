import { Shell } from "@/components/layout/Shell";
import { InstallApp } from "./install-app";

export default function HomePage() {
  return (
    <Shell>
      <section className="mt-4 animate-fade-up">
        <h1 className="text-gradient-primary text-[40px] leading-[1.05] font-extrabold tracking-tight">
          GoRolê
        </h1>
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
