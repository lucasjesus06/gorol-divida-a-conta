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
  center,
}: {
  children: ReactNode;
  className?: string;
  back?: ReactNode;
  right?: ReactNode;
  hideLogo?: boolean;
  /** Puts the content in the middle of the page, below the header. It stays reachable by scrolling when the keyboard takes space. */
  center?: boolean;
}) {
  return (
    <div className="relative min-h-dvh bg-background bg-page-glow">
      <Backdrop />
      <div
        className={cn(
          "relative mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-10 pt-6",
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
        {center ? <div className="my-auto flex w-full flex-col">{children}</div> : children}
      </div>
    </div>
  );
}
