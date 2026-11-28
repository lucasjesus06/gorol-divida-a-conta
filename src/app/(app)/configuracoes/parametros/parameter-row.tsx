"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import { resetParameterAction, saveParameterAction } from "./actions";

export type ParameterRowItem = {
  key: string;
  label: string;
  description: string;
  unit: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  isDefault: boolean;
};

export function ParameterRow({ item }: { item: ParameterRowItem }) {
  const [text, setText] = useState(String(item.value));
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "ok"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const changed = text.trim() !== String(item.value);

  function run(work: () => Promise<{ error?: string }>, okText: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await work();
      setAsking(false);
      setMessage(result.error ? { kind: "error", text: result.error } : { kind: "ok", text: okText });
    });
  }

  return (
    <li className="card-surface flex flex-col gap-3 p-4">
      <div>
        <p className="font-semibold">{item.label}</p>
        <p className="text-sm text-muted-foreground">{item.description}</p>
        <p className="text-xs text-muted-foreground">
          Entre {item.min} e {item.max} {item.unit} · padrão {item.defaultValue}
          {item.isDefault ? "" : " · alterado"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={item.label}
          inputMode="numeric"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setAsking(false);
          }}
          className={`${inputClass} max-w-28`}
        />
        <span className="text-sm text-muted-foreground">{item.unit}</span>
        {asking ? (
          <>
            <Button type="button" size="sm" disabled={pending} onClick={() => run(() => saveParameterAction({ key: item.key, value: text }), "Salvo.")}>
              Sim, salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setAsking(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="secondary" disabled={pending || !changed} onClick={() => setAsking(true)}>
            Salvar
          </Button>
        )}
        {!item.isDefault && !asking && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setText(String(item.defaultValue));
              run(() => resetParameterAction(item.key), "Voltou ao padrão.");
            }}
          >
            Voltar ao padrão
          </Button>
        )}
      </div>
      {asking && <p className="text-sm">Vale a partir de agora para todo mundo e não muda o que já foi registrado. Confirma?</p>}
      {message && (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
          {message.text}
        </p>
      )}
    </li>
  );
}
