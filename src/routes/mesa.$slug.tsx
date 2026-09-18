import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Share2, Copy, Check, MessageCircle, Receipt, Users, ExternalLink } from "lucide-react";
import { Shell, Pill, Avatar } from "@/components/gorole/Shell";
import { Button } from "@/components/ui/button";
import { useRoleStore, roleTotals, guestTotals, itemClaimedQty, brl } from "@/lib/role-store";

export const Route = createFileRoute("/mesa/$slug")({
  head: () => ({
    meta: [
      { title: "Rolê ativo — GoRolê" },
      { name: "description", content: "Itens da nota fiscal, taxa de serviço por item e status de pagamento de cada amigo da mesa." },
      { property: "og:title", content: "Rolê ativo — GoRolê" },
      { property: "og:description", content: "Painel do dono do rolê: itens da SEFAZ, link da mesa e quem já pagou." },
    ],
  }),
  component: Mesa,
});

function Mesa() {
  const { slug } = Route.useParams();
  const role = useRoleStore((s) => s.roles[slug]);
  const [share, setShare] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!role) {
    return (
      <Shell>
        <div className="mt-20 text-center">
          <p className="text-lg font-bold">Essa mesa ainda não existe 🤔</p>
          <Button asChild className="mt-4">
            <Link to="/scan">Iniciar um rolê</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const totals = roleTotals(role);
  const link = `gorole.com.br/${role.slug}`;
  const guestUrl = `/m/${role.slug}`;

  const copy = () => {
    navigator.clipboard?.writeText(`https://${link}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Shell
      back={
        <Button asChild variant="secondary" size="icon" className="rounded-full">
          <Link to="/" aria-label="Voltar">
            <ArrowLeft />
          </Link>
        </Button>
      }
      right={<Pill>Você é o dono</Pill>}
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs font-medium text-muted-foreground">{role.venue}</p>
        <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight">{role.title}</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mt-5 overflow-hidden rounded-[26px] bg-gradient-primary p-5 shadow-glow"
      >
        <span className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-foreground/10" />
        <p className="text-xs font-medium text-primary-foreground/80">Total da mesa (com {Math.round(role.serviceRate * 100)}% de serviço)</p>
        <p className="mt-1 text-[34px] font-extrabold tracking-tight text-primary-foreground">{brl(totals.total)}</p>
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

      <Button variant="mint" size="lg" className="mt-4 w-full" onClick={() => setShare(true)}>
        <Share2 /> Compartilhar com os amigos
      </Button>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Users className="h-4 w-4" /> Na mesa ({role.guests.length})
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
          {role.guests.map((g) => {
            const t = guestTotals(role, g);
            return (
              <div key={g.id} className="card-surface flex min-w-[124px] flex-col items-center gap-2 p-3.5 text-center">
                <div className="relative">
                  <Avatar name={g.name} />
                  {g.paid && (
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-success text-success-foreground ring-2 ring-card">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  )}
                </div>
                <p className="text-sm font-bold">{g.name}</p>
                <p className={`text-xs font-semibold ${g.paid ? "text-success" : "text-muted-foreground"}`}>
                  {g.paid ? "Pagou" : t.total ? brl(t.total) : "Escolhendo…"}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
          <Receipt className="h-4 w-4" /> Itens da notinha
        </h2>
        <div className="card-surface divide-y divide-border">
          {role.items.map((item, i) => {
            const claimed = itemClaimedQty(role, item.id);
            const fee = item.unitPrice * item.qty * role.serviceRate;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
                className="flex items-center gap-3 p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-card-elevated text-xl">{item.emoji}</span>
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
              <span>Taxa de serviço ({Math.round(role.serviceRate * 100)}%)</span>
              <span>{brl(totals.fee)}</span>
            </div>
            <div className="flex justify-between pt-1 text-base font-extrabold">
              <span>Total</span>
              <span>{brl(totals.total)}</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Chave de acesso: <span className="font-mono">{role.nfeKey}</span>
        </p>
      </section>

      <AnimatePresence>
        {share && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
              onClick={() => setShare(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[32px] border-t border-border bg-card p-6 pb-8"
            >
              <span className="mx-auto mb-5 block h-1.5 w-12 rounded-full bg-muted" />
              <h3 className="text-xl font-extrabold">Link da mesa gerado ✨</h3>
              <p className="mt-1 text-sm text-muted-foreground">Manda no grupo. Ninguém precisa baixar nada.</p>

              <div className="mt-5 flex items-center gap-2 rounded-2xl border border-primary-glow/40 bg-background p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary-glow">🔗</span>
                <span className="min-w-0 flex-1 truncate font-mono text-sm">{link}</span>
                <Button size="sm" variant={copied ? "mint" : "secondary"} onClick={copy}>
                  {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
                </Button>
              </div>

              <div className="mt-4 grid gap-3">
                <Button
                  asChild
                  size="lg"
                  variant="mint"
                  className="w-full"
                >
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`Bora rachar a conta do ${role.title}! Entra aqui e marca o que você consumiu 🍻 https://${link}`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle /> Mandar no WhatsApp
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline" className="w-full">
                  <a href={guestUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> Abrir como convidado (testar)
                  </a>
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </Shell>
  );
}
