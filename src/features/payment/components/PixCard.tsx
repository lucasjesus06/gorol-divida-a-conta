import { useState } from "react";
import { motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { Sparkle } from "@/components/common/Sparkle";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import type { guestTotals } from "@/features/bill";

type GuestTotals = ReturnType<typeof guestTotals>;

export function PixCard({
  totals,
  serviceRate,
  code,
}: {
  totals: GuestTotals;
  serviceRate: number;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.08 }}
      className="card-surface relative mt-5 overflow-hidden p-5"
    >
      <Sparkle className="absolute right-4 top-4" size={16} />
      <p className="text-xs text-muted-foreground">Valor exato</p>
      <p className="mt-1 text-[40px] font-extrabold tracking-tight text-gradient-primary">
        {brl(totals.total)}
      </p>

      <div className="mt-3 space-y-1.5 text-xs">
        {totals.lines.map((l) => (
          <div key={l.item.id} className="flex justify-between text-muted-foreground">
            <span>
              {l.item.emoji} {l.qty % 1 ? l.qty.toFixed(2) : l.qty}× {l.item.name}
            </span>
            <span>{brl(l.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-border pt-1.5 text-muted-foreground">
          <span>Taxa de serviço ({Math.round(serviceRate * 100)}%) só do seu consumo</span>
          <span className="text-mint">{brl(totals.fee)}</span>
        </div>
      </div>

      {/* fake QR */}
      <div className="mx-auto mt-5 grid w-40 grid-cols-12 gap-[2px] rounded-2xl bg-foreground p-3">
        {Array.from({ length: 144 }).map((_, i) => {
          const r = Math.floor(i / 12);
          const c = i % 12;
          const corner = (r < 3 && c < 3) || (r < 3 && c > 8) || (r > 8 && c < 3);
          const on = corner
            ? !(r === 1 && c === 1) && !(r === 1 && c === 10) && !(r === 10 && c === 1)
            : (i * 2654435761) % 7 < 3;
          return (
            <span
              key={i}
              className={`aspect-square rounded-[1px] ${on ? "bg-background" : "bg-foreground"}`}
            />
          );
        })}
      </div>

      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Pix Copia e Cola
      </p>
      <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-border bg-background p-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {code}
        </code>
        <Button size="sm" variant={copied ? "mint" : "default"} onClick={copy}>
          {copied ? <Check /> : <Copy />} {copied ? "Copiado!" : "Copiar"}
        </Button>
      </div>
    </motion.div>
  );
}
