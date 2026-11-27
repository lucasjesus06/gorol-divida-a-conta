"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { requestGuestAccess, type RequestAccessState } from "./actions";

export function GuestRequestForm({ name, phone }: { name: string; phone: string }) {
  const [state, action, pending] = useActionState<RequestAccessState, FormData>(requestGuestAccess, {});

  if (state.done) {
    return (
      <p className="text-sm">
        Recebemos o seu pedido de cadastro. Quando ele for aprovado, você entra com o e-mail informado e o seu histórico
        continua com você.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Nome</dt>
          <dd className="font-semibold">{name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">Telefone</dt>
          <dd className="font-semibold">{phone}</dd>
        </div>
      </dl>
      <label className="flex flex-col gap-2 text-sm font-medium">
        E-mail
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Pedir cadastro
      </Button>
    </form>
  );
}
