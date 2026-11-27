"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { sendCode, verifyCode, type SendCodeState, type VerifyCodeState } from "./actions";

const inputClass =
  "h-11 w-full rounded-2xl border border-input bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function LoginForm({ next }: { next: string }) {
  const [sent, sendAction, sending] = useActionState<SendCodeState, FormData>(sendCode, {});
  const [verified, verifyAction, verifying] = useActionState<VerifyCodeState, FormData>(verifyCode, {});

  if (sent.email) {
    return (
      <form action={verifyAction} className="flex flex-col gap-4">
        <input type="hidden" name="email" value={sent.email} />
        <input type="hidden" name="next" value={next} />
        <p className="text-sm text-muted-foreground">
          Se <span className="font-semibold text-foreground">{sent.email}</span> tiver acesso, enviamos um código
          para esse e-mail.
        </p>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Código
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            className={inputClass}
            aria-describedby={verified.error ? "login-erro" : undefined}
          />
        </label>
        {verified.error && (
          <p id="login-erro" role="alert" className="text-sm text-destructive">
            {verified.error}
          </p>
        )}
        <Button type="submit" disabled={verifying}>
          Entrar
        </Button>
      </form>
    );
  }

  return (
    <form action={sendAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className={inputClass}
          aria-describedby={sent.error ? "login-erro" : undefined}
        />
      </label>
      {sent.error && (
        <p id="login-erro" role="alert" className="text-sm text-destructive">
          {sent.error}
        </p>
      )}
      <Button type="submit" disabled={sending}>
        Enviar código
      </Button>
    </form>
  );
}
