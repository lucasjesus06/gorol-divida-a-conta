import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The accent of the "ê" is its own element so that only it can move; the link is named "GoRolê"
 * for screen readers and the drawn name is hidden from them, so it is never read as "Go Rol e".
 * The hover effect only exists on devices with a real pointer, so it never stays stuck on touch.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="GoRolê"
      className={cn("group inline-flex origin-left items-center gap-3 transition-transform duration-300 motion-safe:hover:scale-105", className)}
    >
      <span aria-hidden className="relative grid h-10 w-10 place-items-center">
        <span className="absolute inset-0 rotate-45 rounded-xl bg-mint/90" />
        <span className="absolute inset-0 -translate-y-0.5 translate-x-1 rotate-45 rounded-xl bg-gradient-primary shadow-glow-sm" />
        <span className="relative text-base font-extrabold text-primary-foreground">G</span>
      </span>
      <span aria-hidden className="text-lg font-bold tracking-tight text-foreground">
        GoRol
        <span className="relative inline-block">
          e
          <svg
            viewBox="0 0 10 5"
            className="absolute left-1/2 top-[0.2em] h-[0.28em] w-[0.46em] -translate-x-1/2 text-foreground transition-transform duration-300 motion-safe:group-hover:-translate-y-[0.14em] motion-safe:group-hover:-rotate-6"
          >
            <path d="M1 4.5 5 0.8 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
    </Link>
  );
}
