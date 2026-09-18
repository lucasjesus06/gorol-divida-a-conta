import type { ReactNode } from "react";
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

export function Sparkle({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("text-mint animate-twinkle", className)}
      aria-hidden
    >
      <path fill="currentColor" d="M12 0c.6 7.2 4.8 11.4 12 12-7.2.6-11.4 4.8-12 12-.6-7.2-4.8-11.4-12-12C7.2 11.4 11.4 7.2 12 0Z" />
    </svg>
  );
}

export function Shell({
  children,
  className,
  back,
  right,
  hideLogo,
}: {
  children: ReactNode;
  className?: string;
  back?: ReactNode;
  right?: ReactNode;
  hideLogo?: boolean;
}) {
  return (
    <div className="relative min-h-screen bg-background bg-page-glow">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-[38%] h-72 w-72 rounded-full bg-primary-deep/40 blur-3xl" />
        <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
        <Sparkle className="absolute right-8 top-24" size={26} />
        <Sparkle className="absolute left-6 top-[62%] [animation-delay:1.2s]" size={14} />
        <span className="absolute right-6 top-[54%] h-3 w-3 rotate-45 rounded-sm bg-primary-glow/80" />
      </div>
      <div className={cn("relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6", className)}>
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {back}
            {!hideLogo && <Logo />}
          </div>
          {right}
        </header>
        {children}
      </div>
    </div>
  );
}

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

export function Avatar({ name, className, size = "md" }: { name: string; className?: string; size?: "sm" | "md" }) {
  const hues = ["bg-primary", "bg-mint-deep", "bg-primary-deep", "bg-accent"];
  const h = hues[name.charCodeAt(0) % hues.length];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-primary-foreground ring-2 ring-background",
        h,
        size === "sm" ? "h-8 w-8 text-xs" : "h-11 w-11 text-sm",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
