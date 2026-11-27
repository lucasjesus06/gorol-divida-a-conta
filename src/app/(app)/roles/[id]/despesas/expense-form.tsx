"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { saveExpenseAction, type ExpenseFormState } from "./actions";

export type FormPerson = { personId: string; name: string; isPayer: boolean };

export type ExpenseFormDefaults = {
  expenseId?: string;
  description: string;
  total: string;
  date: string;
  method: "equal" | "exact";
  payers: Record<string, string>;
  shares: Record<string, string>;
};

export function ExpenseForm({
  outingId,
  me,
  people,
  defaults,
  idempotencyKey,
}: {
  outingId: string;
  me: string;
  idempotencyKey: string;
  people: FormPerson[];
  defaults: ExpenseFormDefaults;
}) {
  const [state, action, pending] = useActionState<ExpenseFormState, FormData>(saveExpenseAction, {});
  const payers = people.filter((person) => person.isPayer);
  const initialPayers = Object.keys(defaults.payers);
  const [multi, setMulti] = useState(initialPayers.length > 1);
  const [method, setMethod] = useState(defaults.method);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {defaults.expenseId && <input type="hidden" name="expenseId" value={defaults.expenseId} />}

      <label className="flex flex-col gap-2 text-sm font-medium">
        Descrição
        <input name="description" required maxLength={120} defaultValue={defaults.description} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Valor total (R$)
          <input name="total" inputMode="decimal" required defaultValue={defaults.total} className={inputClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Data
          <input name="date" type="date" required defaultValue={defaults.date} className={inputClass} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Quem pagou</legend>
        <input type="hidden" name="payerMode" value={multi ? "multi" : "single"} />
        {multi ? (
          payers.map((person) => (
            <label key={person.personId} className="flex items-center gap-3 text-sm">
              <span className="w-28 truncate">{person.name}</span>
              <input
                name={`payer_${person.personId}`}
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={defaults.payers[person.personId] ?? ""}
                className={inputClass}
              />
            </label>
          ))
        ) : (
          <select name="payerSingle" defaultValue={initialPayers[0] ?? (payers.some((person) => person.personId === me) ? me : payers[0]?.personId)} className={inputClass}>
            {payers.map((person) => (
              <option key={person.personId} value={person.personId}>
                {person.name}
              </option>
            ))}
          </select>
        )}
        {payers.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={multi} onChange={(event) => setMulti(event.target.checked)} />
            Mais de uma pessoa pagou
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Como dividir</legend>
        <div className="flex gap-2">
          {(
            [
              ["equal", "Por igual"],
              ["exact", "Valores informados"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-2xl border border-input p-3 text-sm has-[:checked]:border-primary-glow has-[:checked]:bg-primary/10"
            >
              <input type="radio" name="method" value={value} checked={method === value} onChange={() => setMethod(value)} />
              {label}
            </label>
          ))}
        </div>
        {method === "equal" ? (
          <ul className="flex flex-col gap-2">
            {people.map((person) => (
              <li key={person.personId}>
                <label className="flex items-center gap-3 text-sm">
                  <input type="checkbox" name={`equal_${person.personId}`} defaultChecked={defaults.expenseId ? person.personId in defaults.shares : true} />
                  {person.name}
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2">
            {people.map((person) => (
              <li key={person.personId}>
                <label className="flex items-center gap-3 text-sm">
                  <span className="w-28 truncate">{person.name}</span>
                  <input name={`share_${person.personId}`} inputMode="decimal" placeholder="0,00" defaultValue={defaults.shares[person.personId] ?? ""} className={inputClass} />
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {defaults.expenseId ? "Salvar correção" : "Registrar despesa"}
      </Button>
    </form>
  );
}
