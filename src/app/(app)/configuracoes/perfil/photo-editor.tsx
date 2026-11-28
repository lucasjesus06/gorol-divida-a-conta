"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { confirmUploadAction, removeFileAction, requestUploadAction } from "@/app/(app)/arquivos/actions";
import { Avatar } from "@/components/common/Avatar";
import { Button } from "@/components/ui/button";
import { createSupabaseUploadClient } from "@/lib/supabase/browser";
import { squarePhoto } from "@/lib/square-photo";

const PATH = "/configuracoes/perfil";

export function PhotoEditor({ name, photo }: { name: string; photo: { id: string; url: string } | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send(file: File) {
    setError(null);
    startTransition(async () => {
      try {
        const ready = await squarePhoto(file);
        const ticket = await requestUploadAction({ kind: "profile_photo", mimeType: ready.type, sizeBytes: ready.size, name: ready.name });
        if ("error" in ticket) {
          setError(ticket.error);
          return;
        }
        const { error: uploadError } = await createSupabaseUploadClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, ready, { contentType: ready.type });
        if (uploadError) {
          setError("Não foi possível enviar a foto. Tente de novo.");
          return;
        }
        const result = await confirmUploadAction(ticket.fileId, PATH);
        if (result.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("Não foi possível usar esta foto. Tente outra.");
      } finally {
        if (input.current) input.current.value = "";
      }
    });
  }

  function remove() {
    if (!photo) return;
    setError(null);
    startTransition(async () => {
      const result = await removeFileAction(photo.id, PATH);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <Avatar name={name} size="xl" src={photo?.url} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Escolher foto de perfil"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? "Enviando…" : photo ? "Trocar foto" : "Escolher foto"}
        </Button>
        {photo && (
          <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
            Remover foto
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Só quem divide rolê com você vê a sua foto. Ela é recortada em quadrado e reduzida no seu aparelho.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
