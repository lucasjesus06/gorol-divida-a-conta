import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, href, highlight }: { label: string; value: number; href?: string; highlight?: boolean }) {
  const content = (
    <>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("text-3xl font-extrabold tracking-tight", highlight && "text-primary-glow")}>{value}</span>
    </>
  );
  const className = "card-surface flex flex-col gap-1 p-4";

  return href ? (
    <Link href={href} className={cn(className, "transition-colors hover:bg-accent/40")}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}
