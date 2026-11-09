import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Bill } from "@/features/bill";

export function ShareSheet({
  bill,
  open,
  onClose,
}: {
  bill: Bill;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const link = `gorole.com.br/${bill.slug}`;
  const guestUrl = `/m/${bill.slug}?novo=1`;

  const copy = () => {
    navigator.clipboard?.writeText(`https://${link}`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
            onClick={onClose}
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
            <p className="mt-1 text-sm text-muted-foreground">
              Manda no grupo. Ninguém precisa baixar nada.
            </p>

            <div className="mt-5 flex items-center gap-2 rounded-2xl border border-primary-glow/40 bg-background p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary-glow">
                🔗
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm">{link}</span>
              <Button size="sm" variant={copied ? "mint" : "secondary"} onClick={copy}>
                {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <Button asChild size="lg" variant="mint" className="w-full">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Bora rachar a conta do ${bill.title}! Entra aqui e marca o que você consumiu 🍻 https://${link}`)}`}
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
  );
}
