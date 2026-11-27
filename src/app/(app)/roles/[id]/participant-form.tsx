"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { addParticipantAction, type AddParticipantState } from "./actions";

type ContactsApi = { select(properties: string[], options?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]> };

const subscribe = () => () => {};
const hasContactPicker = () => typeof navigator !== "undefined" && "contacts" in navigator && "ContactsManager" in window;

export function ParticipantForm({ outingId }: { outingId: string }) {
  const [state, action, pending] = useActionState<AddParticipantState, FormData>(addParticipantAction, {});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const canPickContact = useSyncExternalStore(subscribe, hasContactPicker, () => false);
  const [handledAdded, setHandledAdded] = useState<AddParticipantState | null>(null);

  if (state.added && handledAdded !== state) {
    setHandledAdded(state);
    setName("");
    setPhone("");
  }

  async function pickContact() {
    const contacts = (navigator as unknown as { contacts: ContactsApi }).contacts;
    try {
      const [contact] = await contacts.select(["name", "tel"], { multiple: false });
      if (contact) {
        setName(contact.name?.[0] ?? "");
        setPhone(contact.tel?.[0] ?? "");
      }
    } catch {
      return;
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="outingId" value={outingId} />
      {canPickContact && (
        <Button type="button" variant="secondary" onClick={pickContact}>
          Escolher da agenda
        </Button>
      )}
      <label className="flex flex-col gap-2 text-sm font-medium">
        Nome no rolê
        <input name="name" required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Telefone com DDD
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className={inputClass}
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.added && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.added} foi adicionado(a) ao rolê.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Adicionar
      </Button>
    </form>
  );
}
