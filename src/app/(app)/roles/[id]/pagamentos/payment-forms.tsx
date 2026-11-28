"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { declarePaymentAction, resolvePaymentAction, revealPixAction, type PaymentFormState, type PixRevealState } from "./actions";

type Person = { personId: string; name: string };

export function DeclarePaymentForm({
  outingId,
  people,
  me,
  idempotencyKey,
  defaults,
  partner,
}: {
  outingId: string;
  people: Person[];
  me: string;
  idempotencyKey: string;
  defaults?: { toId?: string; amount?: string };
  /** Someone who shares the same money with the payer: paying their part too is offered, never imposed. */
  partner?: Person;
}) {
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(declarePaymentAction, {});
  const [onBehalf, setOnBehalf] = useState(false);
  const [behalfOf, setBehalfOf] = useState("");
  const others = people.filter((person) => person.personId !== me);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="flex flex-col gap-2 text-sm font-medium">
        Para quem você pagou
        <select name="toId" required defaultValue={defaults?.toId ?? ""} className={inputClass}>
          <option value="" disabled>
            Escolha
          </option>
          {others.map((person) => (
            <option key={person.personId} value={person.personId}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Valor (R$)
        <input name="amount" inputMode="decimal" required defaultValue={defaults?.amount ?? ""} className={inputClass} />
      </label>
      {partner && !onBehalf && (
        <button
          type="button"
          onClick={() => {
            setOnBehalf(true);
            setBehalfOf(partner.personId);
          }}
          className="self-start text-sm font-semibold text-primary-glow hover:underline"
        >
          Pagar também a parte de {partner.name}
        </button>
      )}
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={onBehalf} onChange={(event) => setOnBehalf(event.target.checked)} />
        Estou pagando em nome de outra pessoa
      </label>
      {onBehalf && (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Em nome de quem
          <select name="onBehalfOfId" required value={behalfOf} onChange={(event) => setBehalfOf(event.target.value)} className={inputClass}>
            <option value="" disabled>
              Escolha
            </option>
            {others.map((person) => (
              <option key={person.personId} value={person.personId}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.done && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          Pagamento declarado. Quem recebeu vai confirmar.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Declarar pagamento
      </Button>
    </form>
  );
}

export function ResolvePayment({ outingId, paymentId }: { outingId: string; paymentId: string }) {
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(resolvePaymentAction, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="confirm" className="flex-1" disabled={pending}>
          Recebi
        </Button>
        <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
          Não recebi
        </Button>
      </div>
    </form>
  );
}

export function PixReveal({ outingId, toId, amountCents }: { outingId: string; toId: string; amountCents: number }) {
  const [state, action, pending] = useActionState<PixRevealState, FormData>(revealPixAction, {});
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <input type="hidden" name="outingId" value={outingId} />
        <input type="hidden" name="toId" value={toId} />
        <input type="hidden" name="amountCents" value={amountCents} />
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Ver chave Pix
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.payload && state.qr && (
        <div className="flex flex-col items-start gap-3 text-sm">
          <p>
            Chave: <span className="font-semibold">{state.display}</span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- QR em data URL, gerado no servidor */}
          <img src={state.qr} alt="QR Code do Pix" width={240} height={240} className="rounded-2xl bg-white p-2" />
          <Button type="button" size="sm" onClick={() => copy(state.payload as string)}>
            {copied ? "Copiado!" : "Copiar Pix copia e cola"}
          </Button>
        </div>
      )}
    </div>
  );
}
