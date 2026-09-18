import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { QrCode, Link2, Wallet, ArrowRight } from "lucide-react";
import { Shell, Pill, Sparkle } from "@/components/gorole/Shell";
import { Button } from "@/components/ui/button";
import { useRoleStore } from "@/lib/role-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GoRolê — Racha a conta do bar sem estresse" },
      { name: "description", content: "Aponte pro QR Code da notinha, compartilhe o link e cada um paga só o que consumiu via Pix. Sem app pros convidados." },
      { property: "og:title", content: "GoRolê — Racha a conta do bar sem estresse" },
      { property: "og:description", content: "Itens direto da Nota Fiscal (SEFAZ), divisão por item e Pix com valor exato." },
    ],
  }),
  component: Home,
});

const steps = [
  { icon: QrCode, title: "Escaneia a notinha", desc: "Puxamos os itens direto da SEFAZ." },
  { icon: Link2, title: "Manda o link", desc: "Galera entra pelo navegador, sem app." },
  { icon: Wallet, title: "Cada um paga o seu", desc: "Pix com o valor exato + taxa justa." },
];

function Home() {
  const active = useRoleStore((s) => s.roles["mesa-da-resenha"]);

  return (
    <Shell>
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-4"
      >
        <Pill>Divisão de conta 2.0</Pill>
        <h1 className="mt-4 text-[40px] font-extrabold leading-[1.05] tracking-tight">
          A resenha é <br />
          <span className="text-gradient-primary">de todos.</span>
          <br />A conta, de cada um.
        </h1>
        <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-muted-foreground">
          Aponte pro QR Code da notinha, compartilhe o link no WhatsApp e cada amigo paga só o que consumiu. Sem app, sem calculadora, sem climão.
        </p>
      </motion.section>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="relative mt-8"
      >
        <div className="absolute -inset-3 rounded-[32px] bg-primary/25 blur-2xl" />
        <div className="card-surface relative overflow-hidden p-5">
          <Sparkle className="absolute right-4 top-4" size={18} />
          <p className="text-xs font-medium text-muted-foreground">Total da última mesa</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">R$ 412,50</p>
          <div className="mt-4 flex items-center gap-2">
            <div className="flex -space-x-2">
              {["L", "M", "J", "A"].map((c, i) => (
                <span
                  key={c}
                  className={`grid h-8 w-8 place-items-center rounded-full text-xs font-bold ring-2 ring-card ${i % 2 ? "bg-mint-deep" : "bg-primary"} text-primary-foreground`}
                >
                  {c}
                </span>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">4 amigos • 3 já pagaram</span>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "75%" }}
              transition={{ delay: 0.6, duration: 0.9, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-primary"
            />
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-8 flex flex-col gap-3"
      >
        <Button asChild variant="hero" size="lg" className="w-full">
          <Link to="/scan">
            <QrCode /> Iniciar Novo Rolê
          </Link>
        </Button>
        {active && (
          <Button asChild variant="secondary" size="lg" className="w-full">
            <Link to="/mesa/$slug" params={{ slug: active.slug }}>
              Voltar pra {active.title} <ArrowRight />
            </Link>
          </Button>
        )}
      </motion.div>

      <ul className="mt-10 space-y-3">
        {steps.map((s, i) => (
          <motion.li
            key={s.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.45 + i * 0.1 }}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card/60 p-3.5"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary-glow">
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{s.title}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          </motion.li>
        ))}
      </ul>
    </Shell>
  );
}
