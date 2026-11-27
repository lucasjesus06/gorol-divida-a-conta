"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { listNotifications, markAllRead, markRead } from "@/server/push";

export async function openNotificationAction(formData: FormData) {
  const profile = await getRenderProfile();
  const id = String(formData.get("id") ?? "");
  if (!isUuid(id)) {
    redirect("/avisos");
  }
  const mine = (await listNotifications(profile.personId)).find((notice) => notice.id === id);
  if (!mine) {
    redirect("/avisos");
  }
  await markRead(profile.personId, id);
  revalidatePath("/", "layout");
  redirect(mine.url);
}

export async function markAllReadAction() {
  const profile = await getRenderProfile();
  await markAllRead(profile.personId);
  revalidatePath("/", "layout");
}
