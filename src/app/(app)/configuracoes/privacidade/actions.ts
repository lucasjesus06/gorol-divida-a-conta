"use server";

import { revalidatePath } from "next/cache";
import { getRenderProfile } from "@/server/auth";
import { restoreRemindersConsent, withdrawRemindersConsent } from "@/server/terms";

export async function withdrawRemindersAction() {
  const profile = await getRenderProfile();
  await withdrawRemindersConsent(profile.personId);
  revalidatePath("/configuracoes/privacidade");
}

export async function restoreRemindersAction() {
  const profile = await getRenderProfile();
  await restoreRemindersConsent(profile.personId);
  revalidatePath("/configuracoes/privacidade");
}
