"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/domain/domain-error";
import { isUuid } from "@/lib/uuid";
import { getRenderProfile } from "@/server/auth";
import { acceptFund, declineFund, endFund, requestFund } from "@/server/shared-funds";

export type FundFormState = { error?: string };

async function run(work: (personId: string) => Promise<void>): Promise<FundFormState> {
  const profile = await getRenderProfile();
  try {
    await work(profile.personId);
  } catch (error) {
    if (error instanceof DomainError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/configuracoes/despesas-compartilhadas");
  return {};
}

function idFrom(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "");
  if (!isUuid(value)) {
    throw new DomainError("shared_fund_not_found", "Declaração não encontrada.");
  }
  return value;
}

export async function requestFundAction(_prevState: FundFormState, formData: FormData): Promise<FundFormState> {
  return run((personId) => requestFund(personId, idFrom(formData, "otherId")).then(() => undefined));
}

export async function acceptFundAction(_prevState: FundFormState, formData: FormData): Promise<FundFormState> {
  return run((personId) => acceptFund(personId, idFrom(formData, "fundId")));
}

export async function declineFundAction(_prevState: FundFormState, formData: FormData): Promise<FundFormState> {
  return run((personId) => declineFund(personId, idFrom(formData, "fundId")));
}

export async function endFundAction(_prevState: FundFormState, formData: FormData): Promise<FundFormState> {
  return run((personId) => endFund(personId, idFrom(formData, "fundId")));
}
