import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { Button } from "@/components/ui/button";
import { createBill } from "@/features/bill";
import { CameraViewfinder } from "./components/CameraViewfinder";
import { ProcessingStatus } from "./components/ProcessingStatus";
import { SCAN_STAGES } from "./constants";

export function ScanPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"camera" | "processing" | "done">("camera");
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (phase !== "processing") return;
    if (stage < SCAN_STAGES.length - 1) {
      const t = setTimeout(() => setStage((s) => s + 1), 1100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      const bill = createBill();
      setPhase("done");
      setTimeout(() => navigate({ to: "/mesa/$slug", params: { slug: bill.slug } }), 900);
    }, 1100);
    return () => clearTimeout(t);
  }, [phase, stage, navigate]);

  return (
    <Shell
      back={
        <Button asChild variant="secondary" size="icon" className="rounded-full">
          <Link to="/" aria-label="Voltar">
            <ArrowLeft />
          </Link>
        </Button>
      }
    >
      <AnimatePresence mode="wait">
        {phase === "camera" && (
          <CameraViewfinder key="cam" onCapture={() => setPhase("processing")} />
        )}
        {phase !== "camera" && (
          <ProcessingStatus key="proc" stage={stage} done={phase === "done"} />
        )}
      </AnimatePresence>
    </Shell>
  );
}
