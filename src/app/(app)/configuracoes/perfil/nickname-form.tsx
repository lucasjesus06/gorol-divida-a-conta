"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { NICKNAME_MAX_LENGTH } from "@/domain/person";
import { saveNicknameAction, type NicknameState } from "./actions";

export function NicknameForm({ current, firstName }: { current: string | null; firstName: string }) {
  const [state, action, pending] = useActionState<NicknameState, FormData>(saveNicknameAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Como você quer ser chamado
        <input name="nickname" defaultValue={current ?? ""} maxLength={NICKNAME_MAX_LENGTH} placeholder={firstName} className={inputClass} />
      </label>
      <p className="text-xs text-muted-foreground">Aparece nas mensagens de cobrança e no seu menu. Deixe vazio para usar o primeiro nome. Nos rolês continua valendo o nome que o dono cadastrou.</p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          Apelido salvo.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Salvar apelido
      </Button>
    </form>
  );
}
