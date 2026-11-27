"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import type { ReminderChannel } from "@/domain/reminder-channels";
import { reminderChannels } from "@/domain/reminder-channels";
import { requireSuperAdmin } from "@/server/auth";
import { pauseCharges, recordReminder, saveTemplates } from "@/server/charges";

export type ChargeActionState = { error?: string; done?: boolean };

const PATH = "/configuracoes/cobrancas";

async function guarded(work: (adminId: string) => Promise<void>): Promise<ChargeActionState> {
  const { personId } = await requireSuperAdmin();
  try {
    await work(personId);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(PATH);
  return { done: true };
}

function pairFrom(input: { debtorId: string; creditorId: string }) {
  if (!isUuid(input.debtorId) || !isUuid(input.creditorId)) {
    throw new DomainError("nothing_owed", "Esta pessoa não deve mais nada a quem ia cobrar.");
  }
  return { debtorId: input.debtorId, creditorId: input.creditorId };
}

export async function recordReminderAction(input: { debtorId: string; creditorId: string; channel: ReminderChannel }) {
  return guarded(async (adminId) => {
    if (!(reminderChannels as readonly string[]).includes(input.channel)) {
      throw new DomainError("reminder_not_allowed", "Esta cobrança não pode ser enviada agora.");
    }
    await recordReminder(adminId, { ...pairFrom(input), channel: input.channel });
  });
}

export async function pauseChargesAction(input: { debtorId: string; creditorId: string }) {
  return guarded((adminId) => pauseCharges(adminId, pairFrom(input)));
}

export async function saveTemplatesAction(_prevState: ChargeActionState, formData: FormData): Promise<ChargeActionState> {
  return guarded((adminId) => saveTemplates(adminId, formData.getAll("template").map(String)));
}
