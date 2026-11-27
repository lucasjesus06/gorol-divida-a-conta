"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { requestAccess, type RequestAccessState } from "./actions";

export function RequestForm() {
  const [state, action, pending] = useActionState<RequestAccessState, FormData>(requestAccess, {});

  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">Recebemos o seu pedido. Quando ele for aprovado, você entra com o e-mail informado.</p>
        <Button asChild variant="secondary">
          <Link href="/login">Voltar para entrar</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Nome
        <input name="name" autoComplete="name" required maxLength={80} className={inputClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        E-mail
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Telefone com DDD
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required className={inputClass} />
      </label>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Não preencha este campo
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Enviar pedido
      </Button>
    </form>
  );
}
