import "server-only";
import { desc, eq } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { people, systemParameterChanges, systemParameters } from "@/db/schema";
import {
  parameterCatalog,
  parameterDefinition,
  resolveParameters,
  validateParameterValue,
  type ParameterDefinition,
  type ParameterValues,
} from "@/domain/system-parameters";

async function overrides(): Promise<ParameterValues> {
  const rows = await getDb().select({ key: systemParameters.key, value: systemParameters.value }).from(systemParameters);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

/** The value in force for every parameter: what the super admin set, or the default. */
export async function getParameterValues(): Promise<ParameterValues> {
  return resolveParameters(await asService(overrides));
}

export type ParameterView = ParameterDefinition & {
  value: number;
  isDefault: boolean;
  updatedAt: Date | null;
};

export async function getParameterViews(): Promise<ParameterView[]> {
  const [set, values] = await asService(async () => [await getDb().select().from(systemParameters), resolveParameters(await overrides())] as const);
  const updated = new Map(set.map((row) => [row.key, row.updatedAt]));
  return parameterCatalog.map((definition) => {
    const value = values[definition.key] as number;
    return { ...definition, value, isDefault: value === definition.default, updatedAt: updated.get(definition.key) ?? null };
  });
}

export type ParameterChange = {
  id: string;
  key: string;
  label: string;
  previousValue: number;
  newValue: number;
  reset: boolean;
  changedByName: string;
  changedAt: Date;
};

export async function listParameterChanges(limit = 50): Promise<ParameterChange[]> {
  const rows = await asService(() =>
    getDb()
      .select({
        id: systemParameterChanges.id,
        key: systemParameterChanges.key,
        previousValue: systemParameterChanges.previousValue,
        newValue: systemParameterChanges.newValue,
        reset: systemParameterChanges.reset,
        changedAt: systemParameterChanges.changedAt,
        changedByName: people.displayName,
      })
      .from(systemParameterChanges)
      .innerJoin(people, eq(people.id, systemParameterChanges.changedBy))
      .orderBy(desc(systemParameterChanges.changedAt))
      .limit(limit),
  );
  return rows.map((row) => ({ ...row, label: parameterCatalog.find((definition) => definition.key === row.key)?.label ?? row.key }));
}

async function change(adminId: string, key: string, newValue: number, reset: boolean): Promise<void> {
  await asService(() =>
    getDb().transaction(async (tx) => {
      const [current] = await tx.select({ value: systemParameters.value }).from(systemParameters).where(eq(systemParameters.key, key)).for("update");
      const previous = current?.value ?? parameterDefinition(key).default;
      // Nothing to do when the value in force is already the one asked for, or when there is nothing to reset.
      if (reset ? current === undefined : previous === newValue) {
        return;
      }
      if (reset) {
        await tx.delete(systemParameters).where(eq(systemParameters.key, key));
      } else {
        await tx
          .insert(systemParameters)
          .values({ key, value: newValue, updatedBy: adminId })
          .onConflictDoUpdate({ target: systemParameters.key, set: { value: newValue, updatedBy: adminId, updatedAt: new Date() } });
      }
      await tx.insert(systemParameterChanges).values({ key, previousValue: previous, newValue, reset, changedBy: adminId });
    }),
  );
}

/** Changes a parameter within its limits. It applies from now on and never rewrites what was already recorded. */
export async function saveParameter(adminId: string, key: string, value: number): Promise<void> {
  await change(adminId, key, validateParameterValue(key, value), false);
}

/** Puts the default value back. */
export async function resetParameter(adminId: string, key: string): Promise<void> {
  await change(adminId, key, parameterDefinition(key).default, true);
}
