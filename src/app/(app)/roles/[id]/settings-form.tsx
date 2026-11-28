"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field-styles";
import type { OutingSettingsView } from "@/server/outing-settings";
import { saveOutingSettingsAction, type SettingsState } from "./settings-actions";

const splitLabels = { equal: "Por igual", exact: "Por valores" } as const;
const routeLabels = { smart: "Rota inteligente (menos Pix)", manual: "Rota manual" } as const;

export function SettingsForm({ outingId, view }: { outingId: string; view: OutingSettingsView }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveOutingSettingsAction, {});
  const { overrides, defaults } = view;

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="outingId" value={outingId} />
      <p className="text-sm text-muted-foreground">Estes ajustes valem só para este rolê. Deixe em branco para usar o padrão do sistema.</p>

      <section className="card-surface flex flex-col gap-4 p-5">
        <h2 className="text-lg font-bold">Encerramento e contestação</h2>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Prazo da votação de encerramento (dias)
          <input name="voteDays" inputMode="numeric" defaultValue={overrides.voteDays ?? ""} placeholder={`padrão: ${defaults.voteDays}`} className={inputClass} />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Prazo para contestar depois de encerrado (dias)
          <input name="disputeWindowDays" inputMode="numeric" defaultValue={overrides.disputeWindowDays ?? ""} placeholder={`padrão: ${defaults.disputeWindowDays}`} className={inputClass} />
        </label>
      </section>

      <section className="card-surface flex flex-col gap-4 p-5">
        <h2 className="text-lg font-bold">Ao lançar e acertar</h2>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Divisão sugerida nas despesas
          <select name="defaultSplit" defaultValue={overrides.defaultSplit ?? ""} className={inputClass}>
            <option value="">Padrão ({splitLabels[defaults.defaultSplit]})</option>
            {Object.entries(splitLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Rota de acerto sugerida
          <select name="suggestedRoute" defaultValue={overrides.suggestedRoute ?? ""} className={inputClass}>
            <option value="">Padrão ({routeLabels[defaults.suggestedRoute]})</option>
            {Object.entries(routeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium">
          Taxa de serviço sugerida nas contas por consumo
          <select name="serviceFeePercent" defaultValue={overrides.serviceFeePercent === null ? "" : String(overrides.serviceFeePercent)} className={inputClass}>
            <option value="">Padrão ({defaults.serviceFeePercent === 0 ? "sem taxa" : `${defaults.serviceFeePercent}%`})</option>
            <option value="0">Sem taxa</option>
            <option value="10">10%</option>
            <option value="13">13%</option>
          </select>
        </label>
      </section>

      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p role="status" className="text-sm text-muted-foreground">
          Ajustes salvos.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Salvar ajustes
      </Button>
    </form>
  );
}
