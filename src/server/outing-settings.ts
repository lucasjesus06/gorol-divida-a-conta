import "server-only";
import { eq } from "drizzle-orm";
import { asService, getDb } from "@/db/client";
import { outingSettings } from "@/db/schema";
import { assertAdmin } from "@/domain/outing-access";
import {
  NO_OVERRIDES,
  effectiveOutingSettings,
  validateOutingSettings,
  type EffectiveOutingSettings,
  type OutingSettingsInput,
} from "@/domain/outing-settings";
import { assertActiveOuting, outingContext, readOutingContext } from "./expenses";
import { getParameterValues } from "./system-parameters";

async function overridesOf(outingId: string): Promise<OutingSettingsInput> {
  const [row] = await asService(() => getDb().select().from(outingSettings).where(eq(outingSettings.outingId, outingId)));
  if (!row) {
    return NO_OVERRIDES;
  }
  return {
    voteDays: row.voteDays,
    disputeWindowDays: row.disputeWindowDays,
    defaultSplit: row.defaultSplit as OutingSettingsInput["defaultSplit"],
    suggestedRoute: row.suggestedRoute as OutingSettingsInput["suggestedRoute"],
    serviceFeePercent: row.serviceFeePercent as OutingSettingsInput["serviceFeePercent"],
  };
}

/** What is in force for the outing. Callers have already checked that the person belongs to it. */
export async function getEffectiveSettings(outingId: string): Promise<EffectiveOutingSettings> {
  const [overrides, system] = await Promise.all([overridesOf(outingId), getParameterValues()]);
  return effectiveOutingSettings(overrides, system);
}

export type OutingSettingsView = {
  overrides: OutingSettingsInput;
  effective: EffectiveOutingSettings;
  /** What would be in force if the owner left everything empty. */
  defaults: EffectiveOutingSettings;
  canEdit: boolean;
};

export async function getOutingSettings(personId: string, outingId: string): Promise<OutingSettingsView> {
  const context = await readOutingContext(personId, outingId);
  const [overrides, system] = await Promise.all([overridesOf(outingId), getParameterValues()]);
  return {
    overrides,
    effective: effectiveOutingSettings(overrides, system),
    defaults: effectiveOutingSettings(NO_OVERRIDES, system),
    canEdit: context.outing.role === "admin" && context.outing.status === "active",
  };
}

/** Only the owner changes them, and only while the outing is open. Empty values go back to the default. */
export async function saveOutingSettings(personId: string, outingId: string, input: OutingSettingsInput): Promise<void> {
  const context = await outingContext(personId, outingId);
  assertAdmin({ role: context.outing.role, status: "active" });
  assertActiveOuting(context.outing.status);
  const valid = validateOutingSettings(input);

  await asService(() =>
    getDb()
      .insert(outingSettings)
      .values({ outingId, ...valid, updatedBy: personId })
      .onConflictDoUpdate({ target: outingSettings.outingId, set: { ...valid, updatedBy: personId, updatedAt: new Date() } }),
  );
}
