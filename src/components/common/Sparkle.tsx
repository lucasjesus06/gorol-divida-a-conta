import { cn } from "@/lib/utils";

export function Sparkle({ className, size = 22 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn("text-mint animate-twinkle", className)}
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M12 0c.6 7.2 4.8 11.4 12 12-7.2.6-11.4 4.8-12 12-.6-7.2-4.8-11.4-12-12C7.2 11.4 11.4 7.2 12 0Z"
      />
    </svg>
  );
}
