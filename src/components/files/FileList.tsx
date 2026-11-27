"use client";

import { useState, useTransition } from "react";
import { openFileAction, removeFileAction } from "@/app/(app)/arquivos/actions";
import { Button } from "@/components/ui/button";

export type FileListItem = { id: string; name: string; sizeLabel: string; canRemove: boolean };

export function FileList({ files, revalidate }: { files: FileListItem[]; revalidate: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open(id: string) {
    setError(null);
    // The window is opened first, in the tap itself, so the browser does not block it.
    const target = window.open("", "_blank");
    startTransition(async () => {
      const result = await openFileAction(id);
      if (result.url && target) {
        target.location.href = result.url;
        return;
      }
      target?.close();
      setError(result.error ?? "Não foi possível abrir o arquivo.");
    });
  }

  function remove(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeFileAction(id, revalidate);
      if (result.error) setError(result.error);
    });
  }

  if (files.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">
              {file.name} <span className="text-xs text-muted-foreground">({file.sizeLabel})</span>
            </span>
            <span className="flex shrink-0 gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => open(file.id)}>
                Abrir
              </Button>
              {file.canRemove && (
                <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => remove(file.id)}>
                  Remover
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
