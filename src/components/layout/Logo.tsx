import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative grid h-8 w-8 place-items-center">
        <span className="absolute inset-0 rotate-45 rounded-lg bg-mint/90" />
        <span className="absolute inset-0 rotate-45 rounded-lg bg-gradient-primary shadow-glow-sm translate-x-1 -translate-y-0.5" />
        <span className="relative text-[13px] font-extrabold text-primary-foreground">G</span>
      </span>
      <span className="text-[15px] font-bold tracking-tight text-foreground">GoRolê</span>
    </Link>
  );
}
