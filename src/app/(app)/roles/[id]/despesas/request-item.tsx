"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { decidePayerRequestAction, type ExpenseFormState } from "./actions";

export function RequestDecision({ outingId, requestId }: { outingId: string; requestId: string }) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(decidePayerRequestAction, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input name="note" placeholder="Observação (opcional)" maxLength={200} className={inputClass} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approve" className="flex-1" disabled={pending}>
          Aprovar
        </Button>
        <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
          Recusar
        </Button>
      </div>
    </form>
  );
}
