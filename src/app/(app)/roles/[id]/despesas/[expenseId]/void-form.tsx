"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { voidExpenseAction, type ExpenseFormState } from "../actions";

export function VoidForm({ outingId, expenseId }: { outingId: string; expenseId: string }) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(voidExpenseAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="expenseId" value={expenseId} />
      <label className="flex flex-col gap-2 text-sm font-medium">
        Motivo da anulação
        <input name="reason" required maxLength={200} className={inputClass} />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="destructive" disabled={pending}>
        Anular despesa
      </Button>
    </form>
  );
}
