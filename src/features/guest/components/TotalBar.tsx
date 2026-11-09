import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import type { guestTotals } from "@/features/bill";

type GuestTotals = ReturnType<typeof guestTotals>;

export function TotalBar({
  slug,
  totals,
  serviceRate,
  paid,
}: {
  slug: string;
  totals: GuestTotals;
  serviceRate: number;
  paid: boolean;
}) {
  const canPay = !paid && totals.total > 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-4 pb-5">
      <motion.div layout className="glass rounded-[26px] p-4 shadow-card">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground">
              Sua parte · {totals.lines.length} {totals.lines.length === 1 ? "item" : "itens"}
            </p>
            <AnimatePresence mode="popLayout">
              <motion.p
                key={totals.total.toFixed(2)}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="text-3xl font-extrabold tracking-tight"
              >
                {brl(totals.total)}
              </motion.p>
            </AnimatePresence>
          </div>
          <div className="text-right text-[11px] leading-relaxed text-muted-foreground">
            <p>Consumo {brl(totals.subtotal)}</p>
            <p>
              Serviço {Math.round(serviceRate * 100)}%{" "}
              <span className="text-mint">{brl(totals.fee)}</span>
            </p>
          </div>
        </div>
        <Button
          asChild={canPay}
          variant="hero"
          size="lg"
          className="mt-3 w-full"
          disabled={!canPay}
        >
          {canPay ? (
            <Link to="/pix/$slug" params={{ slug }}>
              Pagar minha parte <ChevronRight />
            </Link>
          ) : (
            <span>{paid ? "Tudo certo por aqui ✅" : "Marca algo aí primeiro 👆"}</span>
          )}
        </Button>
      </motion.div>
    </div>
  );
}
