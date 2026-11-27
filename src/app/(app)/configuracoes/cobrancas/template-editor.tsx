"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { MAX_TEMPLATES, MAX_TEMPLATE_LENGTH, renderTemplate, templateVariables } from "@/domain/reminder-message";
import { saveTemplatesAction, type ChargeActionState } from "./actions";

const sample = {
  debtorName: "Maria Souza",
  creditorName: "Lucas Jesus",
  amountCents: 4550,
  outingNames: ["Churrasco"],
  pixKey: "lucas@exemplo.com",
};

export function TemplateEditor({ initial }: { initial: string[] }) {
  const [state, action, pending] = useActionState<ChargeActionState, FormData>(saveTemplatesAction, {});
  const [texts, setTexts] = useState(initial);

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Os textos giram a cada cobrança. Variáveis: {templateVariables.map((name) => `{${name}}`).join(" ")}.
      </p>
      {texts.map((text, index) => (
        <div key={index} className="flex flex-col gap-2">
          <label className="flex flex-col gap-2 text-sm font-medium">
            Texto {index + 1}
            <textarea
              name="template"
              value={text}
              maxLength={MAX_TEMPLATE_LENGTH}
              rows={3}
              onChange={(event) => setTexts(texts.map((current, i) => (i === index ? event.target.value : current)))}
              className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <p className="text-xs text-muted-foreground">Prévia: {renderTemplate(text, sample)}</p>
          {texts.length > 1 && (
            <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setTexts(texts.filter((_, i) => i !== index))}>
              Remover texto {index + 1}
            </Button>
          )}
        </div>
      ))}
      {texts.length < MAX_TEMPLATES && (
        <Button type="button" variant="secondary" onClick={() => setTexts([...texts, ""])}>
          Adicionar texto
        </Button>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.done && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          Textos salvos.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Salvar textos
      </Button>
    </form>
  );
}
