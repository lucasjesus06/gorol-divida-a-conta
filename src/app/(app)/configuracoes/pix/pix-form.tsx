"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { savePixKeyAction, type PixState } from "./actions";

const typeOptions = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "phone", label: "Celular" },
  { value: "email", label: "E-mail" },
  { value: "random", label: "Chave aleatória" },
] as const;

export function PixForm({ current }: { current: { type: string; value: string } | null }) {
  const [state, action, pending] = useActionState<PixState, FormData>(savePixKeyAction, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Tipo da chave
        <select name="type" required defaultValue={current?.type ?? ""} className={inputClass}>
          <option value="" disabled>
            Escolha o tipo
          </option>
          {typeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Chave Pix
        <input
          name="value"
          required
          maxLength={80}
          autoComplete="off"
          defaultValue={current?.value ?? ""}
          className={inputClass}
          aria-describedby={state.error ? "pix-erro" : undefined}
        />
      </label>
      {state.error && (
        <p id="pix-erro" role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Salvar chave Pix
      </Button>
    </form>
  );
}
