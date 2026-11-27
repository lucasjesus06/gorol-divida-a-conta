"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { declarePaymentAction, resolvePaymentAction, type PaymentFormState } from "./actions";

type Person = { personId: string; name: string };

export function DeclarePaymentForm({ outingId, people, me, idempotencyKey }: { outingId: string; people: Person[]; me: string; idempotencyKey: string }) {
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(declarePaymentAction, {});
  const [onBehalf, setOnBehalf] = useState(false);
  const others = people.filter((person) => person.personId !== me);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <label className="flex flex-col gap-2 text-sm font-medium">
        Para quem você pagou
        <select name="toId" required defaultValue="" className={inputClass}>
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
        <input name="amount" inputMode="decimal" required className={inputClass} />
      </label>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={onBehalf} onChange={(event) => setOnBehalf(event.target.checked)} />
        Estou pagando em nome de outra pessoa
      </label>
      {onBehalf && (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Em nome de quem
          <select name="onBehalfOfId" required defaultValue="" className={inputClass}>
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
