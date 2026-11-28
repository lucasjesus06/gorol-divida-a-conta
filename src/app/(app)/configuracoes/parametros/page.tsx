import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { parameterGroups } from "@/domain/system-parameters";
import { requireSuperAdmin } from "@/server/auth";
import { getParameterViews, listParameterChanges } from "@/server/system-parameters";
import { ParameterRow } from "./parameter-row";

export const metadata: Metadata = {
  title: "Parâmetros · GoRolê",
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function ParametersContent() {
  await requireSuperAdmin();
  const [views, changes] = await Promise.all([getParameterViews(), listParameterChanges()]);

  return (
    <div className="flex flex-col gap-8">
      {Object.entries(parameterGroups).map(([group, title]) => (
        <section key={group} className="flex flex-col gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <ul className="flex flex-col gap-3">
            {views
              .filter((view) => view.group === group)
              .map((view) => (
                <ParameterRow
                  key={`${view.key}-${view.value}`}
                  item={{ key: view.key, label: view.label, description: view.description, unit: view.unit, value: view.value, defaultValue: view.default, min: view.min, max: view.max, isDefault: view.isDefault }}
                />
              ))}
          </ul>
        </section>
      ))}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Histórico de mudanças</h2>
        {changes.length === 0 ? (
          <p className="card-surface p-5 text-sm text-muted-foreground">Nenhuma mudança ainda: tudo está no valor padrão.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {changes.map((change) => (
              <li key={change.id} className="card-surface flex flex-col gap-1 p-3 text-sm">
                <span className="font-semibold">{change.label}</span>
                <span className="text-muted-foreground">
                  {change.previousValue} → {change.newValue}
                  {change.reset ? " (voltou ao padrão)" : ""} · {change.changedByName} · {dateFormat.format(change.changedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ParametersPage() {
  return (
    <>
      <PageHeader title="Parâmetros" description="Valores das regras do sistema. Mudar vale daí em diante e não reescreve o histórico." backHref="/configuracoes" />
      <Suspense fallback={null}>
        <ParametersContent />
      </Suspense>
    </>
  );
}
