import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { SCAN_STAGES } from "../constants";

export function ProcessingStatus({ stage, done }: { stage: number; done: boolean }) {
  return (
    <motion.div
      key="proc"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-1 flex-col items-center justify-center text-center"
    >
      <div className="relative grid h-36 w-36 place-items-center">
        <span className="absolute inset-0 rounded-full bg-primary/40 animate-pulse-ring" />
        <span className="absolute inset-3 rounded-full bg-primary/30 animate-pulse-ring [animation-delay:0.6s]" />
        <motion.div
          key={done ? "done" : stage}
          initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 16 }}
          className="relative grid h-24 w-24 place-items-center rounded-[28px] bg-gradient-primary text-5xl shadow-glow"
        >
          {done ? (
            <Check className="h-12 w-12 text-primary-foreground" strokeWidth={3} />
          ) : (
            SCAN_STAGES[stage]?.emoji
          )}
        </motion.div>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={done ? "done" : stage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mt-8 text-lg font-bold"
        >
          {done ? "Notinha na mão! Bora pro rolê 🎉" : SCAN_STAGES[stage]?.label}
        </motion.p>
      </AnimatePresence>

      <p className="mt-2 font-mono text-[11px] tracking-wider text-muted-foreground">
        3526 0912 3456 7800 0195 6500 1000 0012 3410 0012 3456
      </p>

      <div className="mt-8 flex gap-1.5">
        {SCAN_STAGES.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${i <= stage ? "w-8 bg-primary-glow" : "w-3 bg-muted"}`}
          />
        ))}
      </div>
    </motion.div>
  );
}
