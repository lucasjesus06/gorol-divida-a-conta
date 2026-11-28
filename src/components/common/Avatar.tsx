import { cn } from "@/lib/utils";

export function Avatar({
  name,
  className,
  size = "md",
  src,
}: {
  name: string;
  className?: string;
  size?: "sm" | "md" | "xl";
  /** The person's photo, when they have one and the viewer may see it. */
  src?: string | null;
}) {
  const hues = ["bg-primary", "bg-mint-deep", "bg-primary-deep", "bg-accent"];
  const h = hues[name.charCodeAt(0) % hues.length];
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold text-primary-foreground ring-2 ring-background",
        h,
        size === "sm" ? "h-8 w-8 text-xs" : size === "xl" ? "h-24 w-24 text-3xl" : "h-11 w-11 text-sm",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage link that expires; next/image would cache it
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
