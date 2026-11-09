import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Check, Users } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { Pill } from "@/components/common/Pill";
import { Shell } from "@/components/layout/Shell";
import { brl } from "@/lib/format";
import {
  guestTotals,
  itemClaimedQty,
  joinBill,
  leaveBill,
  setClaim,
  useBill,
  useCurrentGuestId,
} from "@/features/bill";
import { ItemCard } from "./components/ItemCard";
import { JoinForm } from "./components/JoinForm";
import { TotalBar } from "./components/TotalBar";

export function GuestPage({ slug, isNewGuest }: { slug: string; isNewGuest: boolean }) {
  const navigate = useNavigate();
  const bill = useBill(slug);
  const guestId = useCurrentGuestId(slug);
  const guest = bill?.guests.find((g) => g.id === guestId);

  if (!bill) {
    return (
      <Shell>
        <div className="mt-20 text-center">
          <p className="text-lg font-bold">Esse link não tá valendo mais 😅</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pede pro dono do rolê mandar de novo.
          </p>
        </div>
      </Shell>
    );
  }

  if (!guest || isNewGuest) {
    return (
      <Shell hideLogo right={<Pill>Sem cadastro</Pill>}>
        <JoinForm
          bill={bill}
          onJoin={(name) => {
            joinBill(slug, name);
            navigate({
              to: "/m/$slug",
              params: { slug },
              search: { novo: undefined },
              replace: true,
            });
          }}
        />
      </Shell>
    );
  }

  const totals = guestTotals(bill, guest);

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
              onClick={() => leaveBill(slug)}
            >
              não é você? trocar
            </button>
          </div>
        </div>
      }
      right={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-semibold">
          <Users className="h-3.5 w-3.5 text-mint" /> {bill.guests.length}
        </span>
      }
      className="pb-44"
    >
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p className="text-xs font-medium text-muted-foreground">{bill.title}</p>
        <h1 className="text-2xl font-extrabold tracking-tight">O que você mandou pra dentro?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Toca pra marcar. Dividiu um item com alguém? Usa o{" "}
          <span className="font-semibold text-primary-glow">rachar</span>.
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
        {bill.items.map((item, i) => (
          <ItemCard
            key={item.id}
            item={item}
            index={i}
            claim={guest.claims[item.id]}
            othersQty={itemClaimedQty(bill, item.id, guest.id)}
            rate={bill.serviceRate}
            disabled={guest.paid}
            onChange={(c) => setClaim(slug, guest.id, item.id, c)}
          />
        ))}
      </div>

      <TotalBar slug={slug} totals={totals} serviceRate={bill.serviceRate} paid={guest.paid} />
    </Shell>
  );
}
