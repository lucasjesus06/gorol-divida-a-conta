"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import {
  addBillItemAction,
  answerLeftoverAction,
  claimItemAction,
  closeBillAction,
  releaseClaimAction,
  removeBillItemAction,
  updateBillAmountsAction,
  updateBillItemAction,
  type BillFormState,
} from "../actions";

type Person = { personId: string; name: string };

export function ClaimForm({
  outingId,
  billId,
  itemId,
  people,
  me,
  myQuantity,
}: {
  outingId: string;
  billId: string;
  itemId: string;
  people: Person[];
  me: string;
  myQuantity: string | null;
}) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(claimItemAction, {});
  const [released, release, releasing] = useActionState<BillFormState, FormData>(releaseClaimAction, {});
  const error = state.error ?? released.error;

  return (
    <div className="flex flex-col gap-2">
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="outingId" value={outingId} />
        <input type="hidden" name="billId" value={billId} />
        <input type="hidden" name="itemId" value={itemId} />
        <div className="flex gap-2">
          <input name="quantity" required defaultValue={myQuantity ?? ""} placeholder="Quanto você consumiu: 1, 1/2, 0,5" inputMode="decimal" className={inputClass} />
          <Button type="submit" disabled={pending}>
            {myQuantity ? "Atualizar" : "Marcar"}
          </Button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Dividir com outras pessoas</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {people
              .filter((person) => person.personId !== me)
              .map((person) => (
                <li key={person.personId}>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="sharedWith" value={person.personId} />
                    {person.name}
                  </label>
                </li>
              ))}
          </ul>
        </details>
      </form>
      {myQuantity && (
        <form action={release}>
          <input type="hidden" name="outingId" value={outingId} />
          <input type="hidden" name="billId" value={billId} />
          <input type="hidden" name="itemId" value={itemId} />
          <Button type="submit" variant="ghost" size="sm" disabled={releasing}>
            Não consumi
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function ErrorLine({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  ) : null;
}

export function AddItemForm({ outingId, billId }: { outingId: string; billId: string }) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(addBillItemAction, {});

  return (
    <form action={action} className="card-surface flex flex-col gap-3 p-4">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="billId" value={billId} />
      <div className="grid grid-cols-[1fr_4.5rem_5.5rem] gap-2">
        <input name="description" required maxLength={120} placeholder="O que você consumiu" className={inputClass} aria-label="Item" />
        <input name="quantity" defaultValue="1" inputMode="decimal" className={inputClass} aria-label="Quantidade" />
        <input name="total" required placeholder="R$" inputMode="decimal" className={inputClass} aria-label="Valor do item" />
      </div>
      <ErrorLine message={state.error} />
      <Button type="submit" disabled={pending}>
        Adicionar item
      </Button>
    </form>
  );
}

export function EditItemForm({ outingId, billId, itemId, description, total, quantity }: { outingId: string; billId: string; itemId: string; description: string; total: string; quantity: string }) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(updateBillItemAction, {});
  const [removed, remove, removing] = useActionState<BillFormState, FormData>(removeBillItemAction, {});
  const hidden = (
    <>
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="billId" value={billId} />
      <input type="hidden" name="itemId" value={itemId} />
    </>
  );

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">Corrigir ou remover</summary>
      <div className="mt-2 flex flex-col gap-2">
        <form action={action} className="flex flex-col gap-2">
          {hidden}
          <div className="grid grid-cols-[1fr_4.5rem_5.5rem] gap-2">
            <input name="description" required maxLength={120} defaultValue={description} className={inputClass} aria-label="Item" />
            <input name="quantity" defaultValue={quantity} inputMode="decimal" className={inputClass} aria-label="Quantidade" />
            <input name="total" required defaultValue={total} inputMode="decimal" className={inputClass} aria-label="Valor do item" />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            Salvar
          </Button>
        </form>
        <form action={remove}>
          {hidden}
          <Button type="submit" variant="ghost" size="sm" disabled={removing}>
            Remover item
          </Button>
        </form>
        <ErrorLine message={state.error ?? removed.error} />
      </div>
    </details>
  );
}

export function AmountsForm({ outingId, billId, direct, directTotal, serviceCharge, discount }: { outingId: string; billId: string; direct: boolean; directTotal: string; serviceCharge: string; discount: string }) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(updateBillAmountsAction, {});

  return (
    <form action={action} className="card-surface flex flex-col gap-3 p-4">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="billId" value={billId} />
      {direct ? (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Valor total (R$)
          <input name="directTotal" required defaultValue={directTotal} inputMode="decimal" className={inputClass} />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Taxa de serviço (R$)
            <input name="serviceCharge" defaultValue={serviceCharge} inputMode="decimal" className={inputClass} />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            Desconto (R$)
            <input name="discount" defaultValue={discount} inputMode="decimal" className={inputClass} />
          </label>
        </div>
      )}
      <ErrorLine message={state.error} />
      <Button type="submit" variant="secondary" disabled={pending}>
        Salvar valores
      </Button>
    </form>
  );
}

type Division = "marks" | "equal" | "exact";

export function CloseBillForm({
  outingId,
  billId,
  people,
  payers,
  me,
  direct,
  payersFixed,
  hasLeftover,
}: {
  outingId: string;
  billId: string;
  people: Person[];
  /** People who may be declared as having paid. */
  payers: Person[];
  me: string;
  direct: boolean;
  payersFixed: boolean;
  hasLeftover: boolean;
}) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(closeBillAction, {});
  const [division, setDivision] = useState<Division>(direct ? "equal" : "marks");
  const options: { value: Division; label: string }[] = [
    ...(direct ? [] : [{ value: "marks" as const, label: "Pelo que cada um marcou" }]),
    { value: "equal", label: "Por igual" },
    { value: "exact", label: "Por valores" },
  ];

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="billId" value={billId} />

      {!payersFixed && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Quem pagou</legend>
          {payers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém foi declarado pagante neste rolê. O dono precisa declarar quem pode pagar.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {payers.map((person) => (
                  <li key={person.personId} className="grid grid-cols-[1fr_6rem] items-center gap-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="payer" value={person.personId} defaultChecked={person.personId === me} />
                      {person.name}
                    </label>
                    <input name={`paid_${person.personId}`} placeholder="R$" inputMode="decimal" className={inputClass} aria-label={`Quanto ${person.name} pagou`} />
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">Com uma só pessoa marcada, o valor pode ficar em branco: ela pagou o total.</p>
            </>
          )}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Como dividir</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="division" value={option.value} checked={division === option.value} onChange={() => setDivision(option.value)} />
              {option.label}
            </label>
          ))}
        </div>

        {division === "equal" && (
          <ul className="mt-2 flex flex-col gap-1">
            {people.map((person) => (
              <li key={person.personId}>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sharePerson" value={person.personId} defaultChecked />
                  {person.name}
                </label>
              </li>
            ))}
          </ul>
        )}
        {division === "exact" && (
          <ul className="mt-2 flex flex-col gap-2">
            {people.map((person) => (
              <li key={person.personId} className="grid grid-cols-[1fr_6rem] items-center gap-2 text-sm">
                <input type="hidden" name="shareId" value={person.personId} />
                {person.name}
                <input name={`share_${person.personId}`} placeholder="R$" inputMode="decimal" className={inputClass} aria-label={`Parte de ${person.name}`} />
              </li>
            ))}
          </ul>
        )}
        {division === "marks" &&
          (hasLeftover ? (
            <>
              <p className="text-sm">
                Há itens sem dono. <span className="font-semibold">Eles serão divididos entre todos os participantes.</span> Se alguém se manifestou, ou se você quer assumir, transfira a parte.
              </p>
              <label className="flex flex-col gap-2 text-sm font-medium">
                O que fazer com a parte sem dono
                <select name="leftover" defaultValue="spread" className={inputClass}>
                  <option value="spread">Ratear entre todos</option>
                  <option value={me}>Ficar comigo</option>
                  {people
                    .filter((person) => person.personId !== me)
                    .map((person) => (
                      <option key={person.personId} value={person.personId}>
                        Transferir para {person.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Todos os itens foram marcados.</p>
          ))}
      </fieldset>

      <ErrorLine message={state.error} />
      <Button type="submit" disabled={pending}>
        Fechar conta
      </Button>
    </form>
  );
}

export function LeftoverAnswer({ outingId, billId, canAccept }: { outingId: string; billId: string; canAccept: boolean }) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(answerLeftoverAction, {});

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="billId" value={billId} />
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        {canAccept && (
          <Button type="submit" name="decision" value="accept" className="flex-1" disabled={pending}>
            Aceitar a parte
          </Button>
        )}
        <Button type="submit" name="decision" value="decline" variant="secondary" disabled={pending}>
          {canAccept ? "Recusar" : "Cancelar transferência"}
        </Button>
      </div>
    </form>
  );
}
