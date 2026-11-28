import { DomainError } from "./domain-error";
import { DEFAULT_REMINDER_POLICY, type ReminderPolicy } from "./charge-reminder";
import { CLOSING_VOTE_DAYS } from "./closing-vote";
import { DISPUTE_WINDOW_DAYS } from "./dispute-window";
import { RECEIPT_CONTEST_DAYS } from "./payment";

export type ParameterGroup = "cobranca" | "encerramento" | "pagamentos";
export type ParameterUnit = "horas" | "dias" | "hora do dia" | "vezes";

export type ParameterDefinition = {
  key: string;
  group: ParameterGroup;
  label: string;
  /** What changes for people when the value changes. */
  description: string;
  unit: ParameterUnit;
  default: number;
  min: number;
  max: number;
};

export const parameterGroups: Record<ParameterGroup, string> = {
  cobranca: "Cobrança",
  encerramento: "Encerramento e contestação",
  pagamentos: "Pagamentos",
};

/**
 * Every rule of the system that the super admin can tune. Only rules that something already reads
 * are listed here. The limits keep a typing mistake from turning off the protection a rule gives.
 */
export const parameterCatalog: readonly ParameterDefinition[] = [
  {
    key: "reminder.min_interval_hours",
    group: "cobranca",
    label: "Intervalo entre lembretes",
    description: "Tempo mínimo entre dois lembretes para a mesma dívida.",
    unit: "horas",
    default: DEFAULT_REMINDER_POLICY.minIntervalHours,
    min: 12,
    max: 168,
  },
  {
    key: "reminder.window_start_hour",
    group: "cobranca",
    label: "Começo do horário de envio",
    description: "Hora (de São Paulo) em que os lembretes podem começar a sair.",
    unit: "hora do dia",
    default: DEFAULT_REMINDER_POLICY.sendWindow.startHour,
    min: 6,
    max: 14,
  },
  {
    key: "reminder.window_end_hour",
    group: "cobranca",
    label: "Fim do horário de envio",
    description: "Hora (de São Paulo) em que os lembretes deixam de sair.",
    unit: "hora do dia",
    default: DEFAULT_REMINDER_POLICY.sendWindow.endHour,
    min: 15,
    max: 23,
  },
  {
    key: "reminder.offer_pause_after",
    group: "cobranca",
    label: "Lembretes antes de poder pausar",
    description: "Quantos lembretes seguidos até a pausa poder ser registrada.",
    unit: "vezes",
    default: DEFAULT_REMINDER_POLICY.offerPauseAfter,
    min: 1,
    max: 10,
  },
  {
    key: "reminder.pause_days",
    group: "cobranca",
    label: "Duração da pausa",
    description: "Por quantos dias os lembretes ficam parados depois de uma pausa.",
    unit: "dias",
    default: DEFAULT_REMINDER_POLICY.pauseDays,
    min: 1,
    max: 14,
  },
  {
    key: "reminder.max_pauses",
    group: "cobranca",
    label: "Máximo de pausas",
    description: "Quantas pausas uma mesma dívida pode ter. Zero desliga as pausas.",
    unit: "vezes",
    default: DEFAULT_REMINDER_POLICY.maxPauses,
    min: 0,
    max: 5,
  },
  {
    key: "closing.vote_days",
    group: "encerramento",
    label: "Prazo da votação de encerramento",
    description: "Dias que quem tem a receber tem para responder; depois, o silêncio vale como aceite.",
    unit: "dias",
    default: CLOSING_VOTE_DAYS,
    min: 1,
    max: 14,
  },
  {
    key: "dispute.window_days",
    group: "encerramento",
    label: "Prazo para contestar depois de encerrado",
    description: "Dias, depois do encerramento, em que se contesta sem reabrir o rolê.",
    unit: "dias",
    default: DISPUTE_WINDOW_DAYS,
    min: 1,
    max: 60,
  },
  {
    key: "receipt.contest_days",
    group: "pagamentos",
    label: "Prazo para contestar um comprovante",
    description: "Dias que quem recebeu tem para dizer que o dinheiro não chegou, depois de um pagamento ser confirmado por comprovante.",
    unit: "dias",
    default: RECEIPT_CONTEST_DAYS,
    min: 1,
    max: 14,
  },
];

export type ParameterValues = Record<string, number>;

export function parameterDefinition(key: string): ParameterDefinition {
  const definition = parameterCatalog.find((candidate) => candidate.key === key);
  if (!definition) {
    throw new DomainError("parameter_unknown", "Parâmetro desconhecido.");
  }
  return definition;
}

/** The value must be a whole number inside the limits of the parameter. */
export function validateParameterValue(key: string, value: number): number {
  const definition = parameterDefinition(key);
  if (!Number.isInteger(value)) {
    throw new DomainError("parameter_not_integer", `${definition.label}: informe um número inteiro.`);
  }
  if (value < definition.min || value > definition.max) {
    throw new DomainError(
      "parameter_out_of_range",
      `${definition.label}: o valor precisa ficar entre ${definition.min} e ${definition.max} ${definition.unit}.`,
    );
  }
  return value;
}

/** What is in force: the default of every parameter, replaced by the valid values that were set. */
export function resolveParameters(overrides: ParameterValues): ParameterValues {
  const values: ParameterValues = {};
  for (const definition of parameterCatalog) {
    const set = overrides[definition.key];
    const valid = set !== undefined && Number.isInteger(set) && set >= definition.min && set <= definition.max;
    values[definition.key] = valid ? set : definition.default;
  }
  return values;
}

export function reminderPolicyFrom(values: ParameterValues): ReminderPolicy {
  return {
    minIntervalHours: values["reminder.min_interval_hours"] as number,
    sendWindow: { startHour: values["reminder.window_start_hour"] as number, endHour: values["reminder.window_end_hour"] as number },
    offerPauseAfter: values["reminder.offer_pause_after"] as number,
    pauseDays: values["reminder.pause_days"] as number,
    maxPauses: values["reminder.max_pauses"] as number,
  };
}
