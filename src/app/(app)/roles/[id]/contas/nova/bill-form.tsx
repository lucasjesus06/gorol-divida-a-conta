"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { confirmUploadAction, requestUploadAction } from "@/app/(app)/arquivos/actions";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { describeUnderTotal, readBillDocument, type BillDraft } from "@/domain/bill-document";
import { formatCents, parseMoneyToCents } from "@/domain/money";
import { suggestedServiceCharge } from "@/domain/outing-settings";
import { readDocumentText } from "@/lib/ocr/read-document";
import { createSupabaseUploadClient } from "@/lib/supabase/browser";
import { openBillAction, type BillFormState } from "../actions";

const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

type Mode = "direct" | "detailed";

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
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("direct");
  const [rows, setRows] = useState(3);
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // The photo or print of the note, what was read from it, and the form filled in from that.
  const [document, setDocument] = useState<File | null>(null);
  const [draft, setDraft] = useState<BillDraft | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [reading, setReading] = useState<number | null>(null);
  const [describe, setDescribe] = useState(false);
  const [described, setDescribed] = useState({ describedCents: 0, undescribedCents: 0, error: "" });

  const slip = draft?.kind === "card_slip" && draft.totalCents !== null ? draft.totalCents : null;
  const describingSlip = slip !== null && describe && mode === "detailed";

  /** Saves the photo of the note on the bill. If it fails the bill still exists, and the note can be added there. */
  async function attach(billId: string, file: File) {
    try {
      const ticket = await requestUploadAction({ kind: "bill_document", outingId, subjectId: billId, mimeType: file.type, sizeBytes: file.size, name: file.name });
      if ("error" in ticket) return;
      const { error } = await createSupabaseUploadClient().storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type });
      if (!error) await confirmUploadAction(ticket.fileId, `/roles/${outingId}`);
    } catch {
      // The bill is already open; the note can be attached on its page.
    }
  }

  const [state, action, pending] = useActionState<BillFormState, FormData>(async (previous, formData) => {
    if (document) formData.set("keepOpen", "1");
    const result = await openBillAction(previous, formData);
    if (result.billId && document) {
      await attach(result.billId, document);
      router.push(`/roles/${outingId}/contas/${result.billId}`);
    }
    return result;
  }, {});

  async function readNote(file: File) {
    setReading(0);
    let text = "";
    try {
      text = await readDocumentText(file, setReading);
    } catch {
      text = "";
    }
    const read = readBillDocument(text);
    setDocument(file);
    setDraft(read);
    setDescribe(false);
    if (read.kind === "invoice") {
      setMode("detailed");
      setRows(Math.max(3, read.items.length + 1));
    } else if (read.kind === "card_slip") {
      setMode("direct");
    }
    setFormKey((key) => key + 1);
    setReading(null);
  }

  function updateDescribed() {
    if (slip === null) return;
    const items = [...(form.current?.querySelectorAll<HTMLInputElement>('input[name="itemTotal"]') ?? [])].flatMap((input) => {
      try {
        return input.value.trim() === "" ? [] : [{ description: "item", totalCents: parseMoneyToCents(input.value), quantity: "1" }];
      } catch {
        return [];
      }
    });
    try {
      const result = describeUnderTotal(slip, items);
      setDescribed({ describedCents: result.describedCents, undescribedCents: result.undescribedCents, error: "" });
    } catch (error) {
      setDescribed({ describedCents: 0, undescribedCents: 0, error: (error as Error).message });
    }
  }

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
    <form ref={form} action={action} className="flex flex-col gap-5" onChange={describingSlip ? updateDescribed : undefined}>
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="mode" value={mode} />
      {describingSlip && <input type="hidden" name="slipTotal" value={money(slip)} />}

      <div className="flex flex-col gap-2">
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          aria-label="Ler uma nota"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readNote(file);
            event.target.value = "";
          }}
        />
        <Button type="button" variant="secondary" className="self-start" disabled={reading !== null} onClick={() => picker.current?.click()}>
          {reading === null ? (document ? "Ler outra nota" : "Ler uma nota") : `Lendo a nota…${reading > 0 ? ` ${reading}%` : ""}`}
        </Button>
        {draft?.kind === "invoice" && (
          <p role="status" className="text-sm text-muted-foreground">
            Nota lida. Confira os dados abaixo antes de abrir a conta: nada é aberto sozinho.
          </p>
        )}
        {draft?.kind === "card_slip" && (
          <div role="status" className="flex flex-col gap-2 text-sm">
            <p>
              Comprovante da maquininha: <span className="font-semibold">{formatCents(slip ?? 0)}</span>. Ele traz só o total.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={describe ? "secondary" : "default"}
                onClick={() => {
                  setDescribe(false);
                  setMode("direct");
                  setFormKey((key) => key + 1);
                }}
              >
                Só o valor
              </Button>
              <Button
                type="button"
                size="sm"
                variant={describe ? "default" : "secondary"}
                onClick={() => {
                  setDescribe(true);
                  setMode("detailed");
                  setDescribed({ describedCents: 0, undescribedCents: slip ?? 0, error: "" });
                  setFormKey((key) => key + 1);
                }}
              >
                Descrever os gastos
              </Button>
            </div>
          </div>
        )}
        {draft?.warnings.map((warning) => (
          <p key={warning} role="status" className="text-sm text-destructive">
            {warning}
          </p>
        ))}
      </div>

      <div key={formKey} className="flex flex-col gap-5">
        <div role="radiogroup" aria-label="Como lançar" className="grid grid-cols-2 gap-2">
          <Button type="button" variant={mode === "direct" ? "default" : "secondary"} disabled={describingSlip} onClick={() => setMode("direct")}>
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
          <input name="description" required maxLength={120} defaultValue={draft?.description ?? ""} placeholder={mode === "direct" ? "Mercado" : "Bar do Zé"} className={inputClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Data
          <input name="date" type="date" required defaultValue={draft?.date ?? today} className={inputClass} />
        </label>

        {mode === "direct" ? (
          <label className="flex flex-col gap-2 text-sm font-medium">
            Valor total (R$)
            <input name="directTotal" required inputMode="decimal" defaultValue={money(draft?.totalCents ?? null)} className={inputClass} />
          </label>
        ) : (
          <>
            {describingSlip && (
              <div className="card-surface flex flex-col gap-1 p-4 text-sm">
                <p>
                  Total da nota: <span className="font-semibold">{formatCents(slip ?? 0)}</span> (o limite do que dá para descrever)
                </p>
                <p className="text-muted-foreground">
                  Descrito: {formatCents(described.describedCents)} · Sem descrição: {formatCents(described.undescribedCents)}, que é dividido no fechamento
                </p>
                {described.error && (
                  <p role="alert" className="text-destructive">
                    {described.error}
                  </p>
                )}
              </div>
            )}
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-medium">Itens (opcional)</legend>
              {Array.from({ length: rows }, (_, row) => {
                const item = describingSlip ? undefined : draft?.items[row];
                return (
                  <div key={row} className="grid grid-cols-[1fr_5rem_5.5rem] gap-2">
                    <input name="itemDescription" placeholder="Item" maxLength={120} defaultValue={item?.description ?? ""} className={inputClass} aria-label="Item" />
                    <input name="itemQuantity" placeholder="Qtd" inputMode="decimal" defaultValue={item && item.quantity !== "1" ? item.quantity : ""} className={inputClass} aria-label="Quantidade" />
                    <input name="itemTotal" placeholder="R$" inputMode="decimal" defaultValue={item ? money(item.totalCents) : ""} className={inputClass} aria-label="Valor do item" />
                  </div>
                );
              })}
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setRows((current) => current + 1)}>
                Adicionar item
              </Button>
            </fieldset>
            {!describingSlip && (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Taxa de serviço (R$)
                  <input name="serviceCharge" inputMode="decimal" defaultValue={money(draft?.serviceChargeCents ?? null)} className={inputClass} />
                  {serviceFeePercent > 0 && (
                    <button type="button" onClick={fillServiceCharge} className="self-start text-xs font-semibold text-primary-glow hover:underline">
                      Calcular {serviceFeePercent}% dos itens
                    </button>
                  )}
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Desconto (R$)
                  <input name="discount" inputMode="decimal" defaultValue={money(draft?.discountCents ?? null)} className={inputClass} />
                </label>
              </div>
            )}
          </>
        )}
      </div>

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
