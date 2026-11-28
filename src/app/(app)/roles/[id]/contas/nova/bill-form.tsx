"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { parseMoneyToCents } from "@/domain/money";
import { suggestedServiceCharge } from "@/domain/outing-settings";
import { openBillAction, type BillFormState } from "../actions";

export function BillForm({
  outingId,
  today,
  idempotencyKey,
  serviceFeePercent,
}: {
  outingId: string;
  today: string;
  idempotencyKey: string;
  /** The service charge the owner chose for this outing; 0 means none is suggested. */
  serviceFeePercent: number;
}) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(openBillAction, {});
  const [mode, setMode] = useState<"direct" | "detailed">("direct");
  const [rows, setRows] = useState([0, 1, 2]);
  const form = useRef<HTMLFormElement>(null);

  function fillServiceCharge() {
    const typed = [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="itemTotal"]') ?? [])].flatMap((input) => {
      try {
        return input.value.trim() === "" ? [] : [parseMoneyToCents(input.value)];
      } catch {
        return [];
      }
    });
    const field = form.current?.querySelector<HTMLInputElement>('input[name="serviceCharge"]');
    if (field) {
      field.value = (suggestedServiceCharge(typed, serviceFeePercent) / 100).toFixed(2).replace(".", ",");
    }
  }

  return (
    <form ref={form} action={action} className="flex flex-col gap-5">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="mode" value={mode} />
      <div role="radiogroup" aria-label="Como lançar" className="grid grid-cols-2 gap-2">
        <Button type="button" variant={mode === "direct" ? "default" : "secondary"} onClick={() => setMode("direct")}>
          Só o valor
        </Button>
        <Button type="button" variant={mode === "detailed" ? "default" : "secondary"} onClick={() => setMode("detailed")}>
          Com itens
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {mode === "direct" ? "Para compras simples, como o mercado: só o valor total." : "Para restaurante e bar: os itens podem ser lançados agora ou depois, por quem estiver na mesa."}
      </p>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {mode === "direct" ? "O que foi" : "Onde foi"}
        <input name="description" required maxLength={120} placeholder={mode === "direct" ? "Mercado" : "Bar do Zé"} className={inputClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Data
        <input name="date" type="date" required defaultValue={today} className={inputClass} />
      </label>

      {mode === "direct" ? (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Valor total (R$)
          <input name="directTotal" required inputMode="decimal" className={inputClass} />
        </label>
      ) : (
        <>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-sm font-medium">Itens (opcional)</legend>
            {rows.map((row) => (
              <div key={row} className="grid grid-cols-[1fr_5rem_5.5rem] gap-2">
                <input name="itemDescription" placeholder="Item" maxLength={120} className={inputClass} aria-label="Item" />
                <input name="itemQuantity" placeholder="Qtd" inputMode="decimal" className={inputClass} aria-label="Quantidade" />
                <input name="itemTotal" placeholder="R$" inputMode="decimal" className={inputClass} aria-label="Valor do item" />
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRows((current) => [...current, current.length])}>
              Adicionar item
            </Button>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2 text-sm font-medium">
              Taxa de serviço (R$)
              <input name="serviceCharge" inputMode="decimal" className={inputClass} />
              {serviceFeePercent > 0 && (
                <button type="button" onClick={fillServiceCharge} className="self-start text-xs font-semibold text-primary-glow hover:underline">
                  Calcular {serviceFeePercent}% dos itens
                </button>
              )}
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              Desconto (R$)
              <input name="discount" inputMode="decimal" className={inputClass} />
            </label>
          </div>
        </>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {mode === "direct" ? "Lançar" : "Abrir conta"}
      </Button>
    </form>
  );
}
