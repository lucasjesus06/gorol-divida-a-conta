import { motion } from "motion/react";
import { Receipt } from "lucide-react";
import { brl } from "@/lib/format";
import { billTotals, itemClaimedQty, type Bill } from "@/features/bill";

export function ReceiptItems({ bill }: { bill: Bill }) {
  const totals = billTotals(bill);
  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
        <Receipt className="h-4 w-4" /> Itens da notinha
      </h2>
      <div className="card-surface divide-y divide-border">
        {bill.items.map((item, i) => {
          const claimed = itemClaimedQty(bill, item.id);
          const fee = item.unitPrice * item.qty * bill.serviceRate;
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + i * 0.05 }}
              className="flex items-center gap-3 p-4"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card-elevated text-xl">
                {item.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  {item.qty}× {brl(item.unitPrice)} · serviço {brl(fee)}
                </p>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-mint transition-all duration-500"
                    style={{ width: `${Math.min(100, (claimed / item.qty) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{brl(item.unitPrice * item.qty)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {claimed.toFixed(claimed % 1 ? 2 : 0)}/{item.qty} rachado
                </p>
              </div>
            </motion.div>
          );
        })}
        <div className="space-y-1 p-4 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{brl(totals.subtotal)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Taxa de serviço ({Math.round(bill.serviceRate * 100)}%)</span>
            <span>{brl(totals.fee)}</span>
          </div>
          <div className="flex justify-between pt-1 text-base font-extrabold">
            <span>Total</span>
            <span>{brl(totals.total)}</span>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        Chave de acesso: <span className="font-mono">{bill.nfeKey}</span>
      </p>
    </section>
  );
}
