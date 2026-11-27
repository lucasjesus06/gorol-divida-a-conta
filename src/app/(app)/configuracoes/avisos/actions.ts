"use server";

import { DomainError } from "@/domain/domain-error";
import { getRenderProfile } from "@/server/auth";
import { removeSubscription, saveSubscription } from "@/server/push";

export type DeviceState = { error?: string };

export async function enableDeviceAction(input: { endpoint: string; p256dh: string; auth: string }): Promise<DeviceState> {
  const profile = await getRenderProfile();
  try {
    await saveSubscription(profile.personId, input);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  return {};
}

export async function disableDeviceAction(endpoint: string): Promise<DeviceState> {
  const profile = await getRenderProfile();
  await removeSubscription(profile.personId, endpoint);
  return {};
}
