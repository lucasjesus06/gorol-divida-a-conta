import { useState } from "react";
import { motion } from "motion/react";
import { ChevronRight, UserRound } from "lucide-react";
import { Avatar } from "@/components/common/Avatar";
import { Sparkle } from "@/components/common/Sparkle";
import { Button } from "@/components/ui/button";
import type { Bill } from "@/features/bill";

export function JoinForm({ bill, onJoin }: { bill: Bill; onJoin: (name: string) => void }) {
  const [name, setName] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col"
    >
      <div className="relative mt-6">
        <Sparkle className="absolute -left-2 -top-6" size={18} />
        <p className="text-xs font-medium text-primary-glow">{bill.venue}</p>
        <h1 className="mt-1 text-[34px] font-extrabold leading-tight tracking-tight">
          Bem-vindo à <span className="text-gradient-primary">{bill.title}</span> 🍻
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Diz só o seu primeiro nome pra galera saber quem é você. Sem senha, sem app, sem
          enrolação.
        </p>
      </div>

      <div className="mt-6 flex -space-x-2">
        {bill.guests.map((g) => (
          <Avatar key={g.id} name={g.name} size="sm" />
        ))}
        <span className="ml-4 self-center pl-2 text-xs text-muted-foreground">
          {bill.guests.map((g) => g.name).join(", ")} já estão aqui
        </span>
      </div>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onJoin(name);
        }}
      >
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Seu primeiro nome
        </label>
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
        <Button
          type="submit"
          variant="hero"
          size="lg"
          className="mt-4 w-full"
          disabled={!name.trim()}
        >
          Entrar na mesa <ChevronRight />
        </Button>
      </form>
    </motion.div>
  );
}
