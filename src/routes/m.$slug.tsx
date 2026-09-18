import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Minus, Plus, Users, ChevronRight, Check, UserRound } from "lucide-react";
import { Shell, Pill, Avatar, Sparkle } from "@/components/gorole/Shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useRoleStore,
  joinRole,
  leaveRole,
  setClaim,
  guestTotals,
  itemClaimedQty,
  claimQty,
  brl,
  type Item,
  type Claim,
} from "@/lib/role-store";

export const Route = createFileRoute("/m/$slug")({
  validateSearch: (s: Record<string, unknown>) => ({ novo: s["novo"] === 1 || s["novo"] === "1" ? 1 : undefined }),
  head: () => ({
    meta: [
      { title: "Entrar na mesa — GoRolê" },
      { name: "description", content: "Marque o que você consumiu e pague só a sua parte via Pix. Sem baixar nada." },
      { property: "og:title", content: "Bora rachar a conta? — GoRolê" },
      { property: "og:description", content: "Entre na mesa digital com seu nome, marque seus itens e pague via Pix." },
    ],
  }),
  component: Guest,
});

function Guest() {
  const { slug } = Route.useParams();
  const { novo } = Route.useSearch();
  const navigate = useNavigate();
  const role = useRoleStore((s) => s.roles[slug]);
  const guestId = useRoleStore((s) => s.currentGuest[slug]);
  const guest = role?.guests.find((g) => g.id === guestId);
  const [name, setName] = useState("");

  if (!role) {
    return (
      <Shell>
        <div className="mt-20 text-center">
          <p className="text-lg font-bold">Esse link não tá valendo mais 😅</p>
          <p className="mt-1 text-sm text-muted-foreground">Pede pro dono do rolê mandar de novo.</p>
        </div>
      </Shell>
    );
  }

  if (!guest || novo) {
    return (
      <Shell hideLogo right={<Pill>Sem cadastro</Pill>}>
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col">
          <div className="relative mt-6">
            <Sparkle className="absolute -left-2 -top-6" size={18} />
            <p className="text-xs font-medium text-primary-glow">{role.venue}</p>
            <h1 className="mt-1 text-[34px] font-extrabold leading-tight tracking-tight">
              Bem-vindo à <span className="text-gradient-primary">{role.title}</span> 🍻
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Diz só o seu primeiro nome pra galera saber quem é você. Sem senha, sem app, sem enrolação.
            </p>
          </div>

          <div className="mt-6 flex -space-x-2">
            {role.guests.map((g) => (
              <Avatar key={g.id} name={g.name} size="sm" />
            ))}
            <span className="ml-4 self-center pl-2 text-xs text-muted-foreground">
              {role.guests.map((g) => g.name).join(", ")} já estão aqui
            </span>
          </div>

          <form
            className="mt-8"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              joinRole(slug, name);
              navigate({ to: "/m/$slug", params: { slug }, search: { novo: undefined }, replace: true });
            }}
          >
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seu primeiro nome</label>
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-input bg-card px-4 py-1 focus-within:border-primary-glow focus-within:shadow-glow-sm">
              <UserRound className="h-5 w-5 text-muted-foreground" />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Bia"
                className="h-12 w-full bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <Button type="submit" variant="hero" size="lg" className="mt-4 w-full" disabled={!name.trim()}>
              Entrar na mesa <ChevronRight />
            </Button>
          </form>
        </motion.div>
      </Shell>
    );
  }

  const totals = guestTotals(role, guest);

  return (
    <Shell
      hideLogo
      back={
        <div className="flex items-center gap-2.5">
          <Avatar name={guest.name} size="sm" />
          <div className="leading-tight">
            <p className="text-sm font-bold">Oi, {guest.name}!</p>
            <button
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => leaveRole(slug)}
            >
              não é você? trocar
            </button>
          </div>
        </div>
      }
      right={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold">
          <Users className="h-3.5 w-3.5 text-mint" /> {role.guests.length}
        </span>
      }
      className="pb-44"
    >
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs font-medium text-muted-foreground">{role.title}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">O que você mandou pra dentro?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toca pra marcar. Dividiu um item com alguém? Usa o <span className="font-semibold text-primary-glow">rachar</span>.
        </p>
      </motion.div>

      {guest.paid && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-success/40 bg-success/10 p-3.5 text-sm">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-success text-success-foreground">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
          <p>
            <span className="font-bold">Sua parte já tá paga!</span>{" "}
            <span className="text-muted-foreground">{brl(guest.paidAmount ?? 0)} recebido.</span>
          </p>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {role.items.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            index={i}
            claim={guest.claims[item.id]}
            othersQty={itemClaimedQty(role, item.id, guest.id)}
            rate={role.serviceRate}
            disabled={guest.paid}
            onChange={(c) => setClaim(slug, guest.id, item.id, c)}
          />
        ))}
      </div>

      {/* Sticky total */}
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
                Serviço {Math.round(role.serviceRate * 100)}% <span className="text-mint">{brl(totals.fee)}</span>
              </p>
            </div>
          </div>
          <Button
            asChild={!guest.paid && totals.total > 0}
            variant="hero"
            size="lg"
            className="mt-3 w-full"
            disabled={guest.paid || totals.total <= 0}
          >
            {!guest.paid && totals.total > 0 ? (
              <Link to="/pix/$slug" params={{ slug }}>
                Pagar minha parte <ChevronRight />
              </Link>
            ) : (
              <span>{guest.paid ? "Tudo certo por aqui ✅" : "Marca algo aí primeiro 👆"}</span>
            )}
          </Button>
        </motion.div>
      </div>
    </Shell>
  );
}

function ItemCard({
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
      <button type="button" onClick={toggle} className="flex w-full items-center gap-3 p-4 text-left">
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
                    splitOf ? "border-mint/60 bg-mint/15 text-mint" : "border-border text-muted-foreground hover:text-foreground",
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
                            splitOf === n ? "bg-primary text-primary-foreground" : "hover:bg-accent",
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
