import { motion } from "motion/react";
import { Camera, ImageUp, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CameraViewfinder({ onCapture }: { onCapture: () => void }) {
  return (
    <motion.div
      key="cam"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
    >
      <h1 className="text-2xl font-extrabold tracking-tight">
        Aponte para o QR Code da Notinha Fiscal
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">NFC-e ou SAT — fica no rodapé do cupom.</p>

      <div className="relative mt-6 aspect-[3/4] overflow-hidden rounded-[28px] border border-border bg-card">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,oklch(0.3_0.05_285),oklch(0.14_0.01_285))]" />
        <div className="absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(0deg,transparent_0_2px,oklch(1_0_0/0.04)_2px_3px)]" />
        {/* fake receipt */}
        <div className="absolute left-1/2 top-1/2 w-40 -translate-x-1/2 -translate-y-1/2 rotate-[-4deg] rounded-md bg-foreground/90 p-3 text-[7px] leading-tight text-background shadow-card">
          <p className="text-center font-bold">BOTECO DO ZÉ</p>
          <p className="text-center">CNPJ 12.345.678/0001-95</p>
          <div className="my-1 border-t border-dashed border-background/40" />
          <p>CHOPP BRAHMA 300ML ×8 …… 96,00</p>
          <p>PICANHA NA CHAPA ×1 …… 89,00</p>
          <p>CAIPIRINHA LIMAO ×3 …… 66,00</p>
          <div className="my-1 border-t border-dashed border-background/40" />
          <div className="mx-auto mt-1 grid h-14 w-14 grid-cols-6 gap-px bg-background p-0.5">
            {Array.from({ length: 36 }).map((_, i) => (
              <span
                key={i}
                className={
                  (i * 7) % 3 === 0 || i < 6 || i % 6 === 0 ? "bg-foreground" : "bg-background"
                }
              />
            ))}
          </div>
        </div>
        {/* frame corners */}
        <div className="absolute inset-10">
          {[
            "top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl",
            "top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl",
            "bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl",
            "bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl",
          ].map((c) => (
            <span key={c} className={`absolute h-10 w-10 border-mint ${c}`} />
          ))}
          <span className="absolute left-0 right-0 h-0.5 animate-scan bg-mint shadow-[0_0_18px_2px_var(--mint)]" />
        </div>
        <div className="absolute inset-x-0 bottom-4 flex justify-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium">
            <ScanLine className="h-3.5 w-3.5 text-mint" /> Procurando QR Code…
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="hero" size="lg" onClick={onCapture}>
          <Camera /> Capturar
        </Button>
        <Button variant="secondary" size="lg" onClick={onCapture}>
          <ImageUp /> Da galeria
        </Button>
      </div>
    </motion.div>
  );
}
