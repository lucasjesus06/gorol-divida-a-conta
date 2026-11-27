"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { redeemInviteAction, type RedeemInviteState } from "./actions";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<RedeemInviteState, FormData>(redeemInviteAction, {});

  if (state.done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">Sua conta está pronta. Entre com o e-mail que você informou.</p>
        <Button asChild>
          <Link href="/login">Entrar</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
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
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Criar conta
      </Button>
    </form>
  );
}
