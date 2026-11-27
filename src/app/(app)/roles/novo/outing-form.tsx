"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { createOutingAction, type CreateOutingState } from "./actions";

const kinds = [
  { value: "event", label: "Pontual", hint: "Um churrasco, uma viagem, uma festa." },
  { value: "recurring", label: "Recorrente", hint: "Uma turma que divide contas ao longo do tempo." },
];

export function OutingForm() {
  const [state, action, pending] = useActionState<CreateOutingState, FormData>(createOutingAction, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Nome do rolê
        <input name="name" required maxLength={120} className={inputClass} />
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Tipo</legend>
        {kinds.map((kind, index) => (
          <label
            key={kind.value}
            className="flex cursor-pointer items-start gap-3 rounded-2xl border border-input p-3 has-[:checked]:border-primary-glow has-[:checked]:bg-primary/10"
          >
            <input type="radio" name="kind" value={kind.value} defaultChecked={index === 0} className="mt-1" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold">{kind.label}</span>
              <span className="text-xs text-muted-foreground">{kind.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Criar rolê
      </Button>
    </form>
  );
}
