"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { formatCents } from "@/domain/money";
import { grantAmnestyAction, type AmnestyFormState } from "./actions";

type Row = { expenseId: string; description: string; outingName: string; remainingCents: number };

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function AmnestyForm({ debtorId, debtorName, rows, idempotencyKey }: { debtorId: string; debtorName: string; rows: Row[]; idempotencyKey: string }) {
  const [state, action, pending] = useActionState<AmnestyFormState, FormData>(grantAmnestyAction, {});

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="debtorId" value={debtorId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.expenseId} className="card-surface grid grid-cols-[1fr_6.5rem] items-center gap-3 p-4">
            <label className="flex min-w-0 items-start gap-3 text-sm">
              <input type="checkbox" name="expense" value={row.expenseId} className="mt-1" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{row.description}</span>
                <span className="text-xs text-muted-foreground">
                  {row.outingName} · resta {formatCents(row.remainingCents)}
                </span>
              </span>
            </label>
            <input name={`amount_${row.expenseId}`} defaultValue={money(row.remainingCents)} inputMode="decimal" className={inputClass} aria-label={`Quanto perdoar de ${row.description}`} />
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Perdoar não tem volta: o valor sai do que {debtorName} deve a você, fica registrado no histórico e {debtorName} é avisado(a).
      </p>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Perdoar o que marquei
      </Button>
    </form>
  );
}
