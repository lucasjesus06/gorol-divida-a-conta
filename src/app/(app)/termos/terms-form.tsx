"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptTermsAction, type TermsState } from "./actions";

export function TermsForm() {
  const [state, action, pending] = useActionState<TermsState, FormData>(acceptTermsAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="terms" required className="mt-1" />
        Li e aceito os termos de uso e o aviso de privacidade.
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="reminders" required className="mt-1" />
        Aceito receber lembretes de pagamento quando eu devo dinheiro a alguém. Posso retirar isso depois em Configurações, Privacidade.
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Aceitar e continuar
      </Button>
    </form>
  );
}
