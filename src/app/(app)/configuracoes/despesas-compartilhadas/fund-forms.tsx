"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { acceptFundAction, declineFundAction, endFundAction, requestFundAction, type FundFormState } from "./actions";

function ErrorLine({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function RequestFundForm({ candidates }: { candidates: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FundFormState, FormData>(requestFundAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Com quem você divide as despesas
        <select name="otherId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Escolha
          </option>
          {candidates.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <ErrorLine message={state.error} />
      <Button type="submit" disabled={pending}>
        Pedir para declarar
      </Button>
    </form>
  );
}

export function AnswerFundForm({ fundId }: { fundId: string }) {
  const [accepted, accept, accepting] = useActionState<FundFormState, FormData>(acceptFundAction, {});
  const [declined, decline, declining] = useActionState<FundFormState, FormData>(declineFundAction, {});

  return (
    <div className="flex flex-col gap-2">
      <ErrorLine message={accepted.error ?? declined.error} />
      <div className="flex gap-2">
        <form action={accept} className="flex-1">
          <input type="hidden" name="fundId" value={fundId} />
          <Button type="submit" className="w-full" disabled={accepting}>
            Aceitar
          </Button>
        </form>
        <form action={decline}>
          <input type="hidden" name="fundId" value={fundId} />
          <Button type="submit" variant="secondary" disabled={declining}>
            Recusar
          </Button>
        </form>
      </div>
    </div>
  );
}

export function EndFundForm({ fundId }: { fundId: string }) {
  const [state, action, pending] = useActionState<FundFormState, FormData>(endFundAction, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="fundId" value={fundId} />
      <ErrorLine message={state.error} />
      <Button type="submit" variant="secondary" className="self-start" disabled={pending}>
        Desfazer a declaração
      </Button>
    </form>
  );
}
