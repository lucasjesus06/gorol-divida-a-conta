"use client";

import { useRef, useState, useTransition } from "react";
import { confirmUploadAction, requestUploadAction } from "@/app/(app)/arquivos/actions";
import { Button } from "@/components/ui/button";
import { createSupabaseUploadClient } from "@/lib/supabase/browser";

type Props = {
  kind: "expense_evidence" | "payment_receipt" | "bill_document";
  outingId: string;
  subjectId: string;
  label: string;
  /** Where to refresh after the file is saved. */
  revalidate: string;
};

export function FileUploader({ kind, outingId, subjectId, label, revalidate }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(file: File) {
    setError(null);
    startTransition(async () => {
      try {
        const ticket = await requestUploadAction({ kind, outingId, subjectId, mimeType: file.type, sizeBytes: file.size, name: file.name });
        if ("error" in ticket) {
          setError(ticket.error);
          return;
        }
        const { error: uploadError } = await createSupabaseUploadClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
        if (uploadError) {
          setError("Não foi possível enviar o arquivo. Tente de novo.");
          return;
        }
        const result = await confirmUploadAction(ticket.fileId, revalidate);
        if (result.error) {
          setError(result.error);
        }
      } catch {
        setError("Não foi possível enviar o arquivo. Tente de novo.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
        }}
      />
      <Button type="button" variant="secondary" size="sm" className="self-start" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? "Enviando…" : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
