"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { routeDefaults, serviceFeeOptions, splitDefaults, type OutingSettingsInput } from "@/domain/outing-settings";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { saveOutingSettings } from "@/server/outing-settings";

export type SettingsState = { error?: string; saved?: boolean };

function days(formData: FormData, name: string): number | null {
  const text = String(formData.get(name) ?? "").trim();
  return text === "" ? null : Number(text.replace(",", "."));
}

function choice<T extends string>(formData: FormData, name: string, options: readonly T[]): T | null {
  const value = String(formData.get(name) ?? "");
  return (options as readonly string[]).includes(value) ? (value as T) : null;
}

function fee(formData: FormData): OutingSettingsInput["serviceFeePercent"] {
  const text = String(formData.get("serviceFeePercent") ?? "");
  const value = Number(text);
  return text !== "" && (serviceFeeOptions as readonly number[]).includes(value) ? (value as OutingSettingsInput["serviceFeePercent"]) : null;
}

export async function saveOutingSettingsAction(_prevState: SettingsState, formData: FormData): Promise<SettingsState> {
  const profile = await getRenderProfile();
  const outingId = String(formData.get("outingId") ?? "");
  if (!isUuid(outingId)) {
    return { error: "Rolê não encontrado." };
  }
  try {
    await saveOutingSettings(profile.personId, outingId, {
      voteDays: days(formData, "voteDays"),
      disputeWindowDays: days(formData, "disputeWindowDays"),
      defaultSplit: choice(formData, "defaultSplit", splitDefaults),
      suggestedRoute: choice(formData, "suggestedRoute", routeDefaults),
      serviceFeePercent: fee(formData),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/roles/${outingId}`, "layout");
  return { saved: true };
}
