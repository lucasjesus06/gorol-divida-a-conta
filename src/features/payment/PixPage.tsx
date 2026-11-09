import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Landmark, Zap } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { guestTotals, markPaid, useBill, useCurrentGuestId } from "@/features/bill";
import { BankConfirmationSheet } from "./components/BankConfirmationSheet";
import { PixCard } from "./components/PixCard";
import { simulateBankNotification, type BankNotification } from "./lib/bank-simulation";
import { buildPixCode } from "./lib/pix-code";

export function PixPage({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const bill = useBill(slug);
  const guestId = useCurrentGuestId(slug);
  const guest = bill?.guests.find((g) => g.id === guestId);

  const [waiting, setWaiting] = useState(false);
  const [notification, setNotification] = useState<BankNotification | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [settledName, setSettledName] = useState<string | null>(null);
  const [expires, setExpires] = useState(15 * 60);

  const totals = useMemo(() => (bill && guest ? guestTotals(bill, guest) : null), [bill, guest]);
  const txid = useMemo(
    () =>
      `GOROLE${(guestId ?? "x").toUpperCase()}${Date.now().toString(36).toUpperCase()}`.slice(
        0,
        25,
      ),
    [guestId],
  );
  const code = useMemo(() => (totals ? buildPixCode(totals.total, txid) : ""), [totals, txid]);

  useEffect(() => {
    const t = setInterval(() => setExpires((e) => Math.max(e - 1, 0)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!bill || !guest || !totals) {
    return (
      <Shell>
        <div className="mt-20 text-center">
          <p className="text-lg font-bold">Entra na mesa primeiro 😉</p>
          <Button asChild className="mt-4">
            <Link to="/m/$slug" params={{ slug }} search={{ novo: undefined }}>
              Ir pra mesa
            </Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const simulateBank = () => {
    setWaiting(true);
    setTimeout(() => {
      setWaiting(false);
      setNotification(simulateBankNotification(totals.total));
    }, 1600);
  };

  const settle = (targetGuestId: string) => {
    if (!notification) return;
    const target = bill.guests.find((g) => g.id === targetGuestId);
    if (!target) return;
    const amount = target.id === guest.id ? notification.amount : guestTotals(bill, target).total;
    markPaid(slug, target.id, amount, notification.payerName);
    setNotification(null);
    setChoosing(false);
    setSettledName(target.name);
  };

  const mm = String(Math.floor(expires / 60)).padStart(2, "0");
  const ss = String(expires % 60).padStart(2, "0");

  return (
    <Shell
      back={
        <Button asChild variant="secondary" size="icon" className="rounded-full">
          <Link to="/m/$slug" params={{ slug }} search={{ novo: undefined }} aria-label="Voltar">
            <ArrowLeft />
          </Link>
        </Button>
      }
      hideLogo
      right={
        <span className="rounded-full border border-border bg-card/70 px-3 py-1 font-mono text-xs text-mint">
          expira em {mm}:{ss}
        </span>
      }
    >
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs font-medium text-muted-foreground">Pagando com Pix</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Sua parte, {guest.name} 💸</h1>
      </motion.div>

      <PixCard totals={totals} serviceRate={bill.serviceRate} code={code} />

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-primary-glow/40 bg-primary/10 p-3.5">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/30 text-primary-glow">
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
          <Zap className="relative h-4 w-4" />
        </span>
        <p className="text-xs text-muted-foreground">
          Assim que o banco confirmar, essa tela atualiza sozinha. Não precisa mandar comprovante no
          grupo 🙏
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Só pra testar o protótipo
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="mt-2 w-full"
          onClick={simulateBank}
          disabled={waiting}
        >
          <Landmark /> {waiting ? "Banco processando…" : "Simular Pagamento Bancário"}
        </Button>
      </div>

      <BankConfirmationSheet
        bill={bill}
        guest={guest}
        notification={notification}
        choosing={choosing}
        settledName={settledName}
        onConfirmSelf={() => settle(guest.id)}
        onChooseOther={() => setChoosing(true)}
        onCancelChoice={() => setChoosing(false)}
        onSettle={settle}
        onBackToTable={() =>
          navigate({ to: "/m/$slug", params: { slug }, search: { novo: undefined } })
        }
      />
    </Shell>
  );
}
