"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { saveProfileAction, type ProfileState } from "./actions";

export function ProfileForm() {
  const [state, action, pending] = useActionState<ProfileState, FormData>(saveProfileAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Nome
        <input name="displayName" autoComplete="name" required maxLength={80} className={inputClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Telefone com DDD
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          className={inputClass}
          aria-describedby={state.error ? "perfil-erro" : undefined}
        />
      </label>
      {state.error && (
        <p id="perfil-erro" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Salvar
      </Button>
    </form>
  );
}
