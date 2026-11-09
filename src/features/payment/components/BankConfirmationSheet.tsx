import { AnimatePresence, motion } from "motion/react";
import { Check, PartyPopper, Zap } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/format";
import { guestTotals, type Bill, type Guest } from "@/features/bill";
import type { BankNotification } from "../lib/bank-simulation";

export function BankConfirmationSheet({
  bill,
  guest,
  notification,
  choosing,
  settledName,
  onConfirmSelf,
  onChooseOther,
  onCancelChoice,
  onSettle,
  onBackToTable,
}: {
  bill: Bill;
  guest: Guest;
  notification: BankNotification | null;
  choosing: boolean;
  settledName: string | null;
  onConfirmSelf: () => void;
  onChooseOther: () => void;
  onCancelChoice: () => void;
  onSettle: (guestId: string) => void;
  onBackToTable: () => void;
}) {
  return (
    <AnimatePresence>
      {(notification || settledName) && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/75 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[32px] border-t border-border bg-card p-6 pb-8"
          >
            <span className="mx-auto mb-5 block h-1.5 w-12 rounded-full bg-muted" />

            {settledName ? (
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14 }}
                  className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-success text-success-foreground shadow-[0_0_40px_-6px_var(--success)]"
                >
                  <PartyPopper className="h-9 w-9" />
                </motion.div>
                <h3 className="mt-5 text-2xl font-extrabold">
                  {settledName === guest.name
                    ? "Sua parte tá paga!"
                    : `Parte do(a) ${settledName} quitada!`}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Avisamos o dono do rolê. Agora é só curtir 🍻
                </p>
                <Button variant="hero" size="lg" className="mt-6 w-full" onClick={onBackToTable}>
                  Voltar pra mesa
                </Button>
              </motion.div>
            ) : notification && !choosing ? (
              <>
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mint">
                  <Zap className="h-3.5 w-3.5" /> Webhook recebido · {notification.receivedAt}
                </div>
                <h3 className="mt-2 text-xl font-extrabold leading-snug">
                  Recebemos um Pix de{" "}
                  <span className="text-gradient-primary">{brl(notification.amount)}</span> vindo de{" "}
                  <span className="text-primary-glow">{notification.payerName}</span>.
                </h3>
                <p className="mt-1 text-lg font-bold">Foi você mesmo?</p>
                <p className="mt-3 rounded-xl bg-background p-3 font-mono text-[10px] text-muted-foreground break-all">
                  e2eId: {notification.e2eId}
                </p>
                <div className="mt-5 grid gap-3">
                  <Button variant="hero" size="lg" className="w-full" onClick={onConfirmSelf}>
                    <Check /> Sim, fui eu!
                  </Button>
                  <Button variant="outline" size="lg" className="w-full" onClick={onChooseOther}>
                    Não, paguei para outra pessoa
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-extrabold">Quem você tá quitando?</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  O Pix de {brl(notification?.amount ?? 0)} vai ser associado a essa pessoa.
                </p>
                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                  {bill.guests
                    .filter((g) => g.id !== guest.id)
                    .map((g) => {
                      const t = guestTotals(bill, g);
                      return (
                        <button
                          key={g.id}
                          disabled={g.paid}
                          onClick={() => onSettle(g.id)}
                          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary-glow/60 hover:bg-primary/10 disabled:opacity-50"
                        >
                          <Avatar name={g.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold">{g.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {g.paid ? "Já pagou" : `Deve ${brl(t.total)}`}
                            </p>
                          </div>
                          {!g.paid && (
                            <span className="text-xs font-semibold text-primary-glow">Quitar</span>
                          )}
                        </button>
                      );
                    })}
                </div>
                <Button variant="ghost" className="mt-3 w-full" onClick={onCancelChoice}>
                  Voltar
                </Button>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
