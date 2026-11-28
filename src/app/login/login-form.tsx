"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { OtpInput } from "@/components/ui/otp-input";
import { sendCode, verifyCode, type SendCodeState, type VerifyCodeState } from "./actions";

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
        <OtpInput name="code" label="Código" describedBy={verified.error ? "login-erro" : undefined} invalid={Boolean(verified.error)} />
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
      <p className="text-center text-sm text-muted-foreground">
        Ainda não tem conta?{" "}
        <Link href="/pedir-acesso" className="font-semibold text-primary-glow hover:underline">
          Peça acesso
        </Link>
      </p>
    </form>
  );
}
