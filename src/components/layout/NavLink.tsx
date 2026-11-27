"use client";

import { Home, PartyPopper, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActivePath } from "./nav";

const icons = { home: Home, outings: PartyPopper, admin: ShieldCheck } as const;

export function NavLink({
  href,
  label,
  icon,
  variant,
}: {
  href: string;
  label: string;
  icon: keyof typeof icons;
  variant: "side" | "tab";
}) {
  const active = isActivePath(usePathname(), href);
  const Icon = icons[icon];

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 text-sm font-semibold transition-colors",
        variant === "side"
          ? "rounded-2xl px-4 py-3 hover:bg-accent"
          : "flex-1 flex-col justify-center gap-1 py-2 text-[11px]",
        active ? (variant === "side" ? "bg-primary/15 text-foreground" : "text-primary-glow") : "text-muted-foreground",
      )}
    >
      <Icon className={cn("size-5", active && "text-primary-glow")} />
      {label}
    </Link>
  );
}
