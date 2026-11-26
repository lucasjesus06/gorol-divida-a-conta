import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-glow",
        className,
      )}
    >
      {children}
    </span>
  );
}
