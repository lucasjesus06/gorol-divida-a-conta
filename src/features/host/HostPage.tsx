import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Share2 } from "lucide-react";
import { Pill } from "@/components/common/Pill";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { useBill } from "@/features/bill";
import { GuestStrip } from "./components/GuestStrip";
import { ReceiptItems } from "./components/ReceiptItems";
import { ShareSheet } from "./components/ShareSheet";
import { TotalsCard } from "./components/TotalsCard";

export function HostPage({ slug }: { slug: string }) {
  const bill = useBill(slug);
  const [share, setShare] = useState(false);

  if (!bill) {
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
        <p className="text-xs font-medium text-muted-foreground">{bill.venue}</p>
        <h1 className="mt-0.5 text-3xl font-extrabold tracking-tight">{bill.title}</h1>
      </motion.div>

      <TotalsCard bill={bill} />

      <Button variant="mint" size="lg" className="mt-4 w-full" onClick={() => setShare(true)}>
        <Share2 /> Compartilhar com os amigos
      </Button>

      <GuestStrip bill={bill} />
      <ReceiptItems bill={bill} />
      <ShareSheet bill={bill} open={share} onClose={() => setShare(false)} />
    </Shell>
  );
}
