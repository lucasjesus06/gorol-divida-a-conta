import type { ReactNode } from "react";
import { Backdrop } from "@/components/layout/Backdrop";
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
      <Backdrop />
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
