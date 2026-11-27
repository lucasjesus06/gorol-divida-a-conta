"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { joinAction, type JoinState } from "./actions";

export function JoinForm({ token, participants }: { token: string; participants: { id: string; displayName: string }[] }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinAction, {});

  if (participants.length === 0) {
    return <p className="text-sm">Todos os nomes deste rolê já foram escolhidos. Fale com quem organiza.</p>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-2 text-sm font-medium">
        Quem é você?
        <select name="participantId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Escolha o seu nome
          </option>
          {participants.map((participant) => (
            <option key={participant.id} value={participant.id}>
              {participant.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Confirme o seu telefone com DDD
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required className={inputClass} />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Pedir para entrar
      </Button>
    </form>
  );
}
