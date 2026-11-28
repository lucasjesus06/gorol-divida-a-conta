import { DomainError } from "./domain-error";
import { formatCents, type Cents } from "./money";

export const templateVariables = ["nome", "credor", "valor", "rolês", "chave_pix"] as const;
export type TemplateVariable = (typeof templateVariables)[number];

export const MAX_TEMPLATE_LENGTH = 600;
export const MAX_TEMPLATES = 10;

/** Friendly, meme-like texts used until the super admin writes their own. */
export const DEFAULT_TEMPLATES: readonly string[] = [
  "Oi, {nome}! Passando para lembrar do acerto com {credor}: {valor} dos rolês {rolês}. Chave Pix: {chave_pix}",
  "E o Pix, {nome}? Ainda faltam {valor} para {credor} ({rolês}). Chave Pix: {chave_pix}",
  "{nome}, o {credor} não esqueceu 👀 São {valor} dos rolês {rolês}. Chave Pix: {chave_pix}",
];

const VARIABLE = /\{([^{}\s]+)\}/gu;

/** Rejects a text that is empty, too long, or uses a variable that does not exist. */
export function validateTemplate(body: string): string {
  const text = body.trim();
  if (text.length === 0) {
    throw new DomainError("template_empty", "O texto da mensagem não pode ficar vazio.");
  }
  if (text.length > MAX_TEMPLATE_LENGTH) {
    throw new DomainError("template_too_long", `O texto pode ter no máximo ${MAX_TEMPLATE_LENGTH} caracteres.`);
  }
  for (const match of text.matchAll(VARIABLE)) {
    if (!(templateVariables as readonly string[]).includes(match[1] as string)) {
      throw new DomainError("template_unknown_variable", `A variável {${match[1]}} não existe. Use: ${templateVariables.map((name) => `{${name}}`).join(", ")}.`);
    }
  }
  return text;
}

export function validateTemplates(bodies: string[]): string[] {
  if (bodies.length === 0 || bodies.length > MAX_TEMPLATES) {
    throw new DomainError("templates_count", `Deixe de 1 a ${MAX_TEMPLATES} textos.`);
  }
  return bodies.map(validateTemplate);
}

export type MessageValues = {
  debtorName: string;
  /** What the debtor likes to be called, when they chose something. */
  debtorNickname?: string | null;
  creditorName: string;
  creditorNickname?: string | null;
  amountCents: Cents;
  outingNames: string[];
  pixKey: string | null;
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function renderTemplate(body: string, values: MessageValues): string {
  const replacements: Record<TemplateVariable, string> = {
    nome: values.debtorNickname ?? firstName(values.debtorName),
    credor: values.creditorNickname ?? firstName(values.creditorName),
    valor: formatCents(values.amountCents),
    rolês: values.outingNames.join(", "),
    chave_pix: values.pixKey ?? "(sem chave cadastrada, peça a ele)",
  };
  return body.replace(VARIABLE, (whole, name: string) => replacements[name as TemplateVariable] ?? whole);
}

/** Rotates the texts so the same person does not get the same message every time. */
export function pickTemplate(templates: readonly string[], sequence: number): string {
  const list = templates.length > 0 ? templates : DEFAULT_TEMPLATES;
  return list[(Math.max(sequence, 1) - 1) % list.length] as string;
}

/** Opens WhatsApp in the right conversation with the message already written. */
export function whatsappLink(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
