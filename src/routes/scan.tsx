import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Camera, ImageUp, ScanLine, Check } from "lucide-react";
import { Shell } from "@/components/gorole/Shell";
import { Button } from "@/components/ui/button";
import { createRole } from "@/lib/role-store";

export const Route = createFileRoute("/scan")({
  head: () => ({
    meta: [
      { title: "Escanear notinha — GoRolê" },
      { name: "description", content: "Aponte para o QR Code da NFC-e ou SAT e deixe o GoRolê puxar os itens da SEFAZ." },
      { property: "og:title", content: "Escanear notinha — GoRolê" },
      { property: "og:description", content: "Leitura do QR Code da nota fiscal e consulta automática à SEFAZ." },
    ],
  }),
  component: Scan,
});

const STAGES = [
  { label: "Lendo o QR Code da notinha…", emoji: "🔍" },
  { label: "Extraindo a chave de acesso de 44 dígitos…", emoji: "🔑" },
  { label: "Consultando a SEFAZ (ela é lenta, calma)…", emoji: "🏛️" },
  { label: "Separando o chopp da picanha…", emoji: "🍺" },
  { label: "Calculando a taxa de serviço por item…", emoji: "🧮" },
];

function Scan() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"camera" | "processing" | "done">("camera");
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (phase !== "processing") return;
    if (stage < STAGES.length - 1) {
      const t = setTimeout(() => setStage((s) => s + 1), 1100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const role = createRole();
      setPhase("done");
      setTimeout(() => navigate({ to: "/mesa/$slug", params: { slug: role.slug } }), 900);
    }, 1100);
    return () => clearTimeout(t);
  }, [phase, stage, navigate]);

  return (
    <Shell
      back={
        <Button asChild variant="secondary" size="icon" className="rounded-full">
          <Link to="/" aria-label="Voltar">
            <ArrowLeft />
          </Link>
        </Button>
      }
    >
      <AnimatePresence mode="wait">
        {phase === "camera" && (
          <motion.div key="cam" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }}>
            <h1 className="text-2xl font-extrabold tracking-tight">Aponte para o QR Code da Notinha Fiscal</h1>
            <p className="mt-1 text-sm text-muted-foreground">NFC-e ou SAT — fica no rodapé do cupom.</p>

            <div className="relative mt-6 aspect-[3/4] overflow-hidden rounded-[28px] border border-border bg-card">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,oklch(0.3_0.05_285),oklch(0.14_0.01_285))]" />
              <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(0deg,transparent_0_2px,oklch(1_0_0/0.04)_2px_3px)]" />
              {/* fake receipt */}
              <div className="absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-md bg-foreground/90 p-3 text-[7px] leading-tight text-background shadow-card">
                <p className="text-center font-bold">BOTECO DO ZÉ</p>
                <p className="text-center">CNPJ 12.345.678/0001-95</p>
                <div className="my-1 border-t border-dashed border-background/40" />
                <p>CHOPP BRAHMA 300ML ×8 …… 96,00</p>
                <p>PICANHA NA CHAPA ×1 …… 89,00</p>
                <p>CAIPIRINHA LIMAO ×3 …… 66,00</p>
                <div className="my-1 border-t border-dashed border-background/40" />
                <div className="mx-auto mt-1 grid h-14 w-14 grid-cols-6 gap-px bg-background p-0.5">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <span key={i} className={(i * 7) % 3 === 0 || i < 6 || i % 6 === 0 ? "bg-foreground" : "bg-background"} />
                  ))}
                </div>
              </div>
              {/* frame corners */}
              <div className="absolute inset-10">
                {["top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl", "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl", "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl", "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl"].map((c) => (
                  <span key={c} className={`absolute h-10 w-10 border-mint ${c}`} />
                ))}
                <span className="absolute left-0 right-0 h-0.5 animate-scan bg-mint shadow-[0_0_18px_2px_var(--mint)]" />
              </div>
              <div className="absolute inset-x-0 bottom-4 flex justify-center">
                <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
                  <ScanLine className="h-3.5 w-3.5 text-mint" /> Procurando QR Code…
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button variant="hero" size="lg" onClick={() => setPhase("processing")}>
                <Camera /> Capturar
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setPhase("processing")}>
                <ImageUp /> Da galeria
              </Button>
            </div>
          </motion.div>
        )}

        {phase !== "camera" && (
          <motion.div
            key="proc"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-1 flex-col items-center justify-center text-center"
          >
            <div className="relative grid h-36 w-36 place-items-center">
              <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
              <span className="absolute inset-3 rounded-full bg-primary/30 animate-pulse-ring [animation-delay:0.6s]" />
              <motion.div
                key={phase === "done" ? "done" : stage}
                initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 16 }}
                className="relative grid h-24 w-24 place-items-center rounded-[28px] bg-gradient-primary text-5xl shadow-glow"
              >
                {phase === "done" ? <Check className="h-12 w-12 text-primary-foreground" strokeWidth={3} /> : STAGES[stage]?.emoji}
              </motion.div>
            </div>

            <AnimatePresence mode="wait">
              <motion.p
                key={phase === "done" ? "done" : stage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-8 text-lg font-bold"
              >
                {phase === "done" ? "Notinha na mão! Bora pro rolê 🎉" : STAGES[stage]?.label}
              </motion.p>
            </AnimatePresence>

            <p className="mt-2 font-mono text-[11px] tracking-wider text-muted-foreground">
              3526 0912 3456 7800 0195 6500 1000 0012 3410 0012 3456
            </p>

            <div className="mt-8 flex gap-1.5">
              {STAGES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-500 ${i <= stage ? "w-8 bg-primary-glow" : "w-3 bg-muted"}`}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Shell>
  );
}
