import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { bindRequestPerson } from "@/db/client";
import { identityFromClaims, type Identity } from "@/domain/identity";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "./access";
import { hasPixKey } from "./pix";
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
  const identity = await requireAccount();
  const profile = await loadProfile(identity.userId);
  if (!profile || !(await isSuperAdmin(identity.userId))) {
    notFound();
  }
  return { userId: identity.userId, personId: profile.personId };
}

async function currentProfile(): Promise<Profile> {
  const identity = await requireIdentity();
  const profile = await loadProfile(identity.userId);
  if (!profile) {
    redirect(identity.kind === "account" ? "/perfil" : "/aguardando");
  }
  if (identity.kind === "account" && !(await hasPixKey(profile.personId))) {
    redirect("/configuracoes/pix");
  }
  await bindRequestPerson(profile.personId);
  return profile;
}

export const getRenderProfile = cache(currentProfile);
