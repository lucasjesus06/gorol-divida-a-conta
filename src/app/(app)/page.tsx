import { Pill } from "@/components/common/Pill";
import { Shell } from "@/components/layout/Shell";
import { InstallApp } from "./install-app";

export default function HomePage() {
  return (
    <Shell>
      <section className="mt-4 animate-fade-up">
        <Pill>Divisão de conta 2.0</Pill>
        <h1 className="mt-4 text-[40px] leading-[1.05] font-extrabold tracking-tight">
          A resenha é <br />
          <span className="text-gradient-primary">de todos.</span>
          <br />A conta, de cada um.
        </h1>
        <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
          Cadastre a galera, mande um único link e cada um marca o que consumiu. No fim, o acerto sai
          com o menor número de Pix.
        </p>
      </section>
      <div className="mt-8">
        <InstallApp />
      </div>
    </Shell>
  );
}
