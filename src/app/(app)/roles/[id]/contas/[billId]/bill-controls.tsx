"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import {
  answerLeftoverAction,
  claimItemAction,
  closeBillAction,
  releaseClaimAction,
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

export function CloseBillForm({ outingId, billId, people, me, hasLeftover }: { outingId: string; billId: string; people: Person[]; me: string; hasLeftover: boolean }) {
  const [state, action, pending] = useActionState<BillFormState, FormData>(closeBillAction, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="outingId" value={outingId} />
      <input type="hidden" name="billId" value={billId} />
      {hasLeftover ? (
        <>
          <p className="text-sm">
            Há itens sem dono. <span className="font-semibold">Eles serão divididos entre todos os participantes.</span> Se alguém se
            manifestou, ou se você quer assumir, transfira a parte.
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
        <>
          <input type="hidden" name="leftover" value="spread" />
          <p className="text-sm text-muted-foreground">Todos os itens foram marcados.</p>
        </>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
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
