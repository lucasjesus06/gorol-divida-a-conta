"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { decideDisputeAction, openDisputeAction, type ExpenseFormState } from "../actions";

export function OpenDisputeForm({ outingId, expenseId, canOptOut }: { outingId: string; expenseId: string; canOptOut: boolean }) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(openDisputeAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="expenseId" value={expenseId} />
      <label className="flex flex-col gap-2 text-sm font-medium">
        O que precisa ser revisto?
        <select name="subject" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            Escolha
          </option>
          <option value="amount">O valor</option>
          <option value="split">A divisão</option>
          {canOptOut && <option value="not_participated">Não participei desta despesa</option>}
          <option value="other">Outro motivo</option>
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Explique
        <textarea
          name="message"
          required
          maxLength={500}
          rows={3}
          className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        Contestar
      </Button>
    </form>
  );
}

export function DisputeDecision({ outingId, disputeId }: { outingId: string; disputeId: string }) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(decideDisputeAction, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="disputeId" value={disputeId} />
      <input name="note" placeholder="Observação (opcional)" maxLength={200} className={inputClass} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" name="decision" value="approve" className="flex-1" disabled={pending}>
          Aceitar
        </Button>
        <Button type="submit" name="decision" value="reject" variant="secondary" disabled={pending}>
          Recusar
        </Button>
      </div>
    </form>
  );
}
