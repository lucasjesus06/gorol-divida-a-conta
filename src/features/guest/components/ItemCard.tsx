import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Minus, Plus } from "lucide-react";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { claimQty, type Claim, type Item } from "@/features/bill";

export function ItemCard({
  item,
  index,
  claim,
  othersQty,
  rate,
  disabled,
  onChange,
}: {
  item: Item;
  index: number;
  claim: Claim | undefined;
  othersQty: number;
  rate: number;
  disabled: boolean;
  onChange: (c: Claim) => void;
}) {
  const units = claim?.units ?? 0;
  const splitOf = claim?.splitOf ?? null;
  const mine = claimQty(claim);
  const selected = mine > 0;
  const remaining = Math.max(item.qty - othersQty - mine, 0);
  const [splitOpen, setSplitOpen] = useState(false);
  const amount = mine * item.unitPrice;

  const toggle = () => {
    if (disabled) return;
    if (selected) onChange({ units: 0, splitOf: null });
    else if (item.qty - othersQty >= 1) onChange({ units: 1, splitOf: null });
    else onChange({ units: 0, splitOf: 2 }); // item already partly taken — start by splitting one
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.05 }}
      className={cn(
        "relative overflow-hidden rounded-[22px] border transition-colors duration-300",
        selected ? "border-primary-glow/70 bg-primary/15 shadow-glow-sm" : "border-border bg-card",
        disabled && "opacity-60",
      )}
    >
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <motion.span
          animate={{ scale: selected ? [1, 1.15, 1] : 1 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl transition-colors",
            selected ? "bg-primary text-primary-foreground" : "bg-card-elevated",
          )}
        >
          {item.emoji}
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{item.name}</p>
          <p className="text-xs text-muted-foreground">
            {brl(item.unitPrice)} un · {item.qty} na nota
            {othersQty > 0 && <> · {othersQty.toFixed(othersQty % 1 ? 2 : 0)} já pegos</>}
          </p>
        </div>
        <span
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-all",
            selected ? "border-mint bg-mint text-success-foreground" : "border-muted-foreground/40",
          )}
        >
          {selected && <Check className="h-4 w-4" strokeWidth={3} />}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {selected && !disabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
              <div className="flex items-center gap-1 rounded-xl bg-background/60 p-1">
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg bg-card-elevated transition hover:bg-accent disabled:opacity-40"
                  disabled={units <= 0}
                  onClick={() => onChange({ units: units - 1, splitOf })}
                  aria-label="Menos um"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-9 text-center text-sm font-bold">
                  {units}
                  {splitOf && <span className="text-[10px] text-mint"> +1/{splitOf}</span>}
                </span>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary-glow disabled:opacity-40"
                  disabled={remaining < 1}
                  onClick={() => onChange({ units: units + 1, splitOf })}
                  aria-label="Mais um"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <button
                  onClick={() => setSplitOpen((o) => !o)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                    splitOf
                      ? "border-mint/60 bg-mint/15 text-mint"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {splitOf ? `Rachando 1 em ${splitOf}` : "Rachar um"}
                </button>
                <AnimatePresence>
                  {splitOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.95 }}
                      className="absolute right-0 top-full z-10 mt-2 flex gap-1 rounded-xl border border-border bg-popover p-1 shadow-card"
                    >
                      {[null, 2, 3, 4].map((n) => (
                        <button
                          key={String(n)}
                          onClick={() => {
                            onChange({ units, splitOf: n });
                            setSplitOpen(false);
                          }}
                          className={cn(
                            "h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition",
                            splitOf === n
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent",
                          )}
                        >
                          {n ? `1/${n}` : "não"}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="text-right">
                <p className="text-sm font-extrabold">{brl(amount)}</p>
                <p className="text-[10px] text-muted-foreground">+ {brl(amount * rate)} serviço</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
