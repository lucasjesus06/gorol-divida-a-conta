import type { ReactNode } from "react";
import { Sparkle } from "@/components/common/Sparkle";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";

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
      <div
        className={cn(
          "relative mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6",
          className,
        )}
      >
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
