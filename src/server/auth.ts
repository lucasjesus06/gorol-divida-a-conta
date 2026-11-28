import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { bindRequestPerson } from "@/db/client";
import { identityFromClaims, type Identity } from "@/domain/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "./access";
import { hasPixKey } from "./pix";
import { hasAcceptedTerms } from "./terms";
import { loadProfile, type Profile } from "./profiles";

export async function getIdentity(): Promise<Identity | null> {
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  return identityFromClaims(data?.claims);
}

export async function requireIdentity(): Promise<Identity> {
  const identity = await getIdentity();
  if (!identity) {
    redirect("/login");
  }
  return identity;
}

export async function requireAccount(): Promise<Extract<Identity, { kind: "account" }>> {
  const identity = await requireIdentity();
  if (identity.kind !== "account") {
    redirect("/login");
  }
  return identity;
}

export async function requireSuperAdmin(): Promise<{ userId: string; personId: string }> {
  const { identity, profile } = await requireReadyAccount();
  if (!(await isSuperAdmin(identity.userId))) {
    notFound();
  }
  return { userId: identity.userId, personId: profile.personId };
}

/**
 * True when the person may use the app: guests always, accounts only after the profile, the terms
 * and the Pix key are done. Until then the menu is not shown and nothing else is reachable.
 */
export const isOnboarded = cache(async (): Promise<boolean> => {
  const identity = await getIdentity();
  if (!identity) {
    return false;
  }
  if (identity.kind !== "account") {
    return true;
  }
  const profile = await loadProfile(identity.userId);
  return profile !== null && (await hasAcceptedTerms(profile.personId)) && (await hasPixKey(profile.personId));
});

/** An account with the profile, the terms and the Pix key done; anyone else is sent to finish them first. */
export async function requireReadyAccount(): Promise<{ identity: Extract<Identity, { kind: "account" }>; profile: Profile }> {
  const identity = await requireAccount();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect("/perfil");
  }
  if (!(await hasAcceptedTerms(profile.personId))) {
    redirect("/termos");
  }
  if (!(await hasPixKey(profile.personId))) {
    redirect("/configuracoes/pix");
  }
  return { identity, profile };
}

async function currentProfile(): Promise<Profile> {
  const identity = await requireIdentity();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect(identity.kind === "account" ? "/perfil" : "/aguardando");
  }
  if (identity.kind === "account" && !(await hasAcceptedTerms(profile.personId))) {
    redirect("/termos");
  }
  if (identity.kind === "account" && !(await hasPixKey(profile.personId))) {
    redirect("/configuracoes/pix");
  }
  await bindRequestPerson(profile.personId);
  return profile;
}

export const getRenderProfile = cache(currentProfile);
