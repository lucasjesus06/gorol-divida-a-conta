import { Sparkle } from "@/components/common/Sparkle";

/**
 * The dark page background: two violet glows that drift slowly and a few stars that pulse.
 * Only transform and opacity are animated, and nothing moves when the system asks for reduced motion.
 */
export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-24 top-[38%] h-72 w-72 rounded-full bg-primary-deep/40 blur-3xl will-change-transform motion-safe:animate-drift-a" />
      <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full bg-primary/25 blur-3xl will-change-transform motion-safe:animate-drift-b" />
      <Sparkle className="absolute right-8 top-24" size={26} />
      <Sparkle className="absolute left-6 top-[62%] [animation-delay:1.2s]" size={14} />
      <Sparkle className="absolute left-[22%] top-[14%] [animation-delay:0.6s]" size={12} />
      <Sparkle className="absolute right-[12%] top-[44%] [animation-delay:1.8s]" size={10} />
      <Sparkle className="absolute bottom-[9%] left-[18%] [animation-delay:2.1s]" size={18} />
      <Sparkle className="absolute bottom-[22%] right-[10%] [animation-delay:0.3s]" size={12} />
      <span className="absolute right-6 top-[54%] h-3 w-3 rotate-45 rounded-sm bg-primary-glow/80" />
    </div>
  );
}
