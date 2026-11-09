import { motion } from "motion/react";
import { brl } from "@/lib/format";
import { billTotals, type Bill } from "@/features/bill";

export function TotalsCard({ bill }: { bill: Bill }) {
  const totals = billTotals(bill);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.1 }}
      className="relative mt-5 overflow-hidden rounded-[26px] bg-gradient-primary p-5 shadow-glow"
    >
      <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-foreground/10" />
      <p className="text-xs font-medium text-primary-foreground/80">
        Total da mesa (com {Math.round(bill.serviceRate * 100)}% de serviço)
      </p>
      <p className="mt-1 text-[34px] font-extrabold tracking-tight text-primary-foreground">
        {brl(totals.total)}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-primary-foreground">
        <div className="rounded-2xl bg-primary-foreground/12 p-3">
          <p className="text-[11px] opacity-80">Já pago</p>
          <p className="text-base font-bold">{brl(totals.paid)}</p>
        </div>
        <div className="rounded-2xl bg-primary-foreground/12 p-3">
          <p className="text-[11px] opacity-80">Falta rachar</p>
          <p className="text-base font-bold">{brl(Math.max(totals.total - totals.claimed, 0))}</p>
        </div>
      </div>
    </motion.div>
  );
}
