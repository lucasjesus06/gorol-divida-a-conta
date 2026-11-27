import { Sparkle } from "@/components/common/Sparkle";

export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-24 top-[38%] h-72 w-72 rounded-full bg-primary-deep/40 blur-3xl" />
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-primary/25 blur-3xl" />
      <Sparkle className="absolute right-8 top-24" size={26} />
      <Sparkle className="absolute left-6 top-[62%] [animation-delay:1.2s]" size={14} />
      <span className="absolute right-6 top-[54%] h-3 w-3 rotate-45 rounded-sm bg-primary-glow/80" />
    </div>
  );
}
