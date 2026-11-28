import { DomainError } from "./domain-error";
import type { Cents } from "./money";
import { validateParameterValue, type ParameterValues } from "./system-parameters";

export const splitDefaults = ["equal", "exact"] as const;
export type SplitDefault = (typeof splitDefaults)[number];

export const routeDefaults = ["smart", "manual"] as const;
export type RouteDefault = (typeof routeDefaults)[number];

export const serviceFeeOptions = [0, 10, 13] as const;
export type ServiceFeePercent = (typeof serviceFeeOptions)[number];

/** What the owner chose for one outing; null means "use the default". */
export type OutingSettingsInput = {
  voteDays: number | null;
  disputeWindowDays: number | null;
  defaultSplit: SplitDefault | null;
  suggestedRoute: RouteDefault | null;
  serviceFeePercent: ServiceFeePercent | null;
};

export const NO_OVERRIDES: OutingSettingsInput = {
  voteDays: null,
  disputeWindowDays: null,
  defaultSplit: null,
  suggestedRoute: null,
  serviceFeePercent: null,
};

/** What is in force for the outing once the defaults fill what the owner left empty. */
export type EffectiveOutingSettings = {
  voteDays: number;
  disputeWindowDays: number;
  defaultSplit: SplitDefault;
  suggestedRoute: RouteDefault;
  serviceFeePercent: ServiceFeePercent;
};

function oneOf<T extends number | string>(value: T | null, options: readonly T[], message: string): T | null {
  if (value !== null && !options.includes(value)) {
    throw new DomainError("outing_setting_invalid", message);
  }
  return value;
}

/** The owner's values must respect the limits the super admin set for the system, and the fixed options. */
export function validateOutingSettings(input: OutingSettingsInput): OutingSettingsInput {
  return {
    voteDays: input.voteDays === null ? null : validateParameterValue("closing.vote_days", input.voteDays),
    disputeWindowDays: input.disputeWindowDays === null ? null : validateParameterValue("dispute.window_days", input.disputeWindowDays),
    defaultSplit: oneOf(input.defaultSplit, splitDefaults, "Escolha a divisão por igual ou por valores."),
    suggestedRoute: oneOf(input.suggestedRoute, routeDefaults, "Escolha a rota inteligente ou a manual."),
    serviceFeePercent: oneOf(input.serviceFeePercent, serviceFeeOptions, "A taxa de serviço é sem taxa, 10% ou 13%."),
  };
}

/** Precedence: the outing's own choice, then the system default. */
export function effectiveOutingSettings(overrides: OutingSettingsInput, system: ParameterValues): EffectiveOutingSettings {
  return {
    voteDays: overrides.voteDays ?? (system["closing.vote_days"] as number),
    disputeWindowDays: overrides.disputeWindowDays ?? (system["dispute.window_days"] as number),
    defaultSplit: overrides.defaultSplit ?? "equal",
    suggestedRoute: overrides.suggestedRoute ?? "smart",
    serviceFeePercent: overrides.serviceFeePercent ?? 0,
  };
}

/** The suggested service charge for the items typed so far, rounded to the cent. */
export function suggestedServiceCharge(itemCents: Cents[], percent: number): Cents {
  const total = itemCents.reduce((sum, cents) => sum + cents, 0);
  return Math.round((total * percent) / 100);
}
