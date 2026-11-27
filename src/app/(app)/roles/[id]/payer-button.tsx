"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { declarePayerAction, type ExpenseFormState } from "./despesas/actions";

export function PayerButton({ outingId, personId }: { outingId: string; personId: string }) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(declarePayerAction, {});

  return (
    <form action={action} className="ml-auto flex flex-col items-end gap-1">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="personId" value={personId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        Tornar pagante
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
