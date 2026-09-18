import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Copy, Check, Landmark, Zap, PartyPopper } from "lucide-react";
import { Shell, Avatar, Sparkle } from "@/components/gorole/Shell";
import { Button } from "@/components/ui/button";
import {
  useRoleStore,
  guestTotals,
  markPaid,
  buildPixCode,
  brl,
  MOCK_PAYER_NAMES,
} from "@/lib/role-store";

export const Route = createFileRoute("/pix/$slug")({
  head: () => ({
    meta: [
      { title: "Pagar minha parte via Pix — GoRolê" },
      { name: "description", content: "Pix Copia e Cola com o valor exato do que você consumiu, confirmado automaticamente." },
      { property: "og:title", content: "Pagar minha parte via Pix — GoRolê" },
      { property: "og:description", content: "Código Pix dinâmico com o valor certinho da sua parte na mesa." },
    ],
  }),
  component: Pix,
});

type Webhook = { amount: number; payerName: string; e2eId: string; receivedAt: string };

function Pix() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const role = useRoleStore((s) => s.roles[slug]);
  const guestId = useRoleStore((s) => s.currentGuest[slug]);
  const guest = role?.guests.find((g) => g.id === guestId);

  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [webhook, setWebhook] = useState<Webhook | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [done, setDone] = useState<{ name: string } | null>(null);
  const [expires, setExpires] = useState(15 * 60);

  const totals = useMemo(() => (role && guest ? guestTotals(role, guest) : null), [role, guest]);
  const txid = useMemo(() => `GOROLE${(guestId ?? "x").toUpperCase()}${Date.now().toString(36).toUpperCase()}`.slice(0, 25), [guestId]);
  const code = useMemo(() => (totals ? buildPixCode(totals.total, txid) : ""), [totals, txid]);

  useEffect(() => {
    const t = setInterval(() => setExpires((e) => Math.max(e - 1, 0)), 1000);
    return () => clearInterval(t);
  }, []);

  if (!role || !guest || !totals) {
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

  const copy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const simulateBank = () => {
    setWaiting(true);
    // Simulated PSP webhook: bank posts the payload after settlement
    setTimeout(() => {
      setWaiting(false);
      setWebhook({
        amount: totals.total,
        payerName: MOCK_PAYER_NAMES[Math.floor(Math.random() * MOCK_PAYER_NAMES.length)] ?? "ANA CAROLINA SOUZA LIMA",
        e2eId: `E${Math.floor(Math.random() * 1e8).toString().padStart(8, "0")}2026091814${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        receivedAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      });
    }, 1600);
  };

  const settle = (targetGuestId: string) => {
    if (!webhook) return;
    const target = role.guests.find((g) => g.id === targetGuestId);
    if (!target) return;
    const amount = target.id === guest.id ? webhook.amount : guestTotals(role, target).total;
    markPaid(slug, target.id, amount, webhook.payerName);
    setWebhook(null);
    setChoosing(false);
    setDone({ name: target.name });
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

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.08 }}
        className="card-surface relative mt-5 overflow-hidden p-5"
      >
        <Sparkle className="absolute right-4 top-4" size={16} />
        <p className="text-xs text-muted-foreground">Valor exato</p>
        <p className="mt-1 text-[40px] font-extrabold tracking-tight text-gradient-primary">{brl(totals.total)}</p>

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
            <span>Taxa de serviço ({Math.round(role.serviceRate * 100)}%) só do seu consumo</span>
            <span className="text-mint">{brl(totals.fee)}</span>
          </div>
        </div>

        {/* fake QR */}
        <div className="mx-auto mt-5 grid w-40 grid-cols-12 gap-[2px] rounded-2xl bg-foreground p-3">
          {Array.from({ length: 144 }).map((_, i) => {
            const r = Math.floor(i / 12);
            const c = i % 12;
            const corner = (r < 3 && c < 3) || (r < 3 && c > 8) || (r > 8 && c < 3);
            const on = corner ? !(r === 1 && c === 1) && !(r === 1 && c === 10) && !(r === 10 && c === 1) : (i * 2654435761) % 7 < 3;
            return <span key={i} className={`aspect-square rounded-[1px] ${on ? "bg-background" : "bg-foreground"}`} />;
          })}
        </div>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pix Copia e Cola</p>
        <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-border bg-background p-2.5">
          <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{code}</code>
          <Button size="sm" variant={copied ? "mint" : "default"} onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
      </motion.div>

      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed border-primary-glow/40 bg-primary/10 p-3.5">
        <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/30 text-primary-glow">
          <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
          <Zap className="relative h-4 w-4" />
        </span>
        <p className="text-xs text-muted-foreground">
          Assim que o banco confirmar, essa tela atualiza sozinha. Não precisa mandar comprovante no grupo 🙏
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card/50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Só pra testar o protótipo</p>
        <Button variant="secondary" size="lg" className="mt-2 w-full" onClick={simulateBank} disabled={waiting}>
          <Landmark /> {waiting ? "Banco processando…" : "Simular Pagamento Bancário"}
        </Button>
      </div>

      {/* Webhook popup */}
      <AnimatePresence>
        {(webhook || done) && (
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

              {done ? (
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
                    {done.name === guest.name ? "Sua parte tá paga!" : `Parte do(a) ${done.name} quitada!`}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">Avisamos o dono do rolê. Agora é só curtir 🍻</p>
                  <Button
                    variant="hero"
                    size="lg"
                    className="mt-6 w-full"
                    onClick={() => navigate({ to: "/m/$slug", params: { slug }, search: { novo: undefined } })}
                  >
                    Voltar pra mesa
                  </Button>
                </motion.div>
              ) : webhook && !choosing ? (
                <>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-mint">
                    <Zap className="h-3.5 w-3.5" /> Webhook recebido · {webhook.receivedAt}
                  </div>
                  <h3 className="mt-2 text-xl font-extrabold leading-snug">
                    Recebemos um Pix de <span className="text-gradient-primary">{brl(webhook.amount)}</span> vindo de{" "}
                    <span className="text-primary-glow">{webhook.payerName}</span>.
                  </h3>
                  <p className="mt-1 text-lg font-bold">Foi você mesmo?</p>
                  <p className="mt-3 rounded-xl bg-background p-3 font-mono text-[10px] text-muted-foreground break-all">
                    e2eId: {webhook.e2eId}
                  </p>
                  <div className="mt-5 grid gap-3">
                    <Button variant="hero" size="lg" className="w-full" onClick={() => settle(guest.id)}>
                      <Check /> Sim, fui eu!
                    </Button>
                    <Button variant="outline" size="lg" className="w-full" onClick={() => setChoosing(true)}>
                      Não, paguei para outra pessoa
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xl font-extrabold">Quem você tá quitando?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O Pix de {brl(webhook!.amount)} vai ser associado a essa pessoa.
                  </p>
                  <div className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                    {role.guests
                      .filter((g) => g.id !== guest.id)
                      .map((g) => {
                        const t = guestTotals(role, g);
                        return (
                          <button
                            key={g.id}
                            disabled={g.paid}
                            onClick={() => settle(g.id)}
                            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary-glow/60 hover:bg-primary/10 disabled:opacity-50"
                          >
                            <Avatar name={g.name} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold">{g.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {g.paid ? "Já pagou" : `Deve ${brl(t.total)}`}
                              </p>
                            </div>
                            {!g.paid && <span className="text-xs font-semibold text-primary-glow">Quitar</span>}
                          </button>
                        );
                      })}
                  </div>
                  <Button variant="ghost" className="mt-3 w-full" onClick={() => setChoosing(false)}>
                    Voltar
                  </Button>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Shell>
  );
}
