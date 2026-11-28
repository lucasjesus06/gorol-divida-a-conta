"use client";

import { useRef, useState } from "react";
import { confirmUploadAction, requestUploadAction } from "@/app/(app)/arquivos/actions";
import { Button } from "@/components/ui/button";
import { readDocumentText } from "@/lib/ocr/read-document";
import { createSupabaseUploadClient } from "@/lib/supabase/browser";
import { sendReceiptAction, type ReceiptResult } from "./actions";

type Step = "idle" | "uploading" | "reading" | "checking";

const stepLabels: Record<Step, string> = {
  idle: "",
  uploading: "Enviando o arquivo…",
  reading: "Lendo o comprovante…",
  checking: "Conferindo com o pagamento…",
};

/**
 * Sends the receipt: the file is saved, read on this device, and the text is checked against the payment.
 * If it cannot be read, it is sent all the same, and the person who receives decides.
 */
export function ReceiptSender({ outingId, paymentId }: { outingId: string; paymentId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptResult | null>(null);

  async function send(file: File) {
    setError(null);
    setResult(null);
    try {
      setStep("uploading");
      const ticket = await requestUploadAction({ kind: "payment_receipt", outingId, subjectId: paymentId, mimeType: file.type, sizeBytes: file.size, name: file.name });
      if ("error" in ticket) {
        setError(ticket.error);
        return;
      }
      const { error: uploadError } = await createSupabaseUploadClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (uploadError) {
        setError("Não foi possível enviar o arquivo. Tente de novo.");
        return;
      }
      const saved = await confirmUploadAction(ticket.fileId, `/roles/${outingId}`);
      if (saved.error) {
        setError(saved.error);
        return;
      }

      setStep("reading");
      let text = "";
      try {
        text = await readDocumentText(file, setProgress);
      } catch {
        // Not being able to read it is not the end: the creditor gets the receipt and sees that nothing was read.
        text = "";
      }

      setStep("checking");
      const outcome = await sendReceiptAction({ outingId, paymentId, fileId: ticket.fileId, text });
      if (outcome.error) {
        setError(outcome.error);
        return;
      }
      setResult(outcome);
    } catch {
      setError("Não foi possível enviar o comprovante. Tente de novo.");
    } finally {
      setStep("idle");
      setProgress(0);
      if (input.current) input.current.value = "";
    }
  }

  const busy = step !== "idle";
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        aria-label="Enviar comprovante"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void send(file);
        }}
      />
      <Button type="button" variant="secondary" size="sm" className="self-start" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? stepLabels[step] + (step === "reading" && progress > 0 ? ` ${progress}%` : "") : "Enviar comprovante"}
      </Button>
      {result?.outcome === "settled" && (
        <p role="status" className="text-sm text-muted-foreground">
          Comprovante conferido: o pagamento foi confirmado. Quem recebeu ainda pode contestar no prazo.
        </p>
      )}
      {result?.outcome === "review" && (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">O comprovante foi enviado, mas quem recebeu precisa conferir:</p>
          <ul className="list-disc pl-5 text-muted-foreground">
            {result.issues?.map((issue) => (
              <li key={issue.code}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
