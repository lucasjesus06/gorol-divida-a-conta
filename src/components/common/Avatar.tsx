import { cn } from "@/lib/utils";

export function Avatar({
  name,
  className,
  size = "md",
}: {
  name: string;
  className?: string;
  size?: "sm" | "md";
}) {
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
