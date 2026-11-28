import { DomainError } from "./domain-error";
import { formatCents, type Cents } from "./money";

/** The name of the line that holds what a card slip total has beyond what the person described. */
export const UNDESCRIBED_LABEL = "Sem descrição";

export type DocumentKind = "invoice" | "card_slip" | "unknown";

export type DraftItem = { description: string; totalCents: Cents; quantity: string };

/** What could be read from a note, a receipt or a card slip. Nothing becomes a bill until the person reviews it. */
export type BillDraft = {
  kind: DocumentKind;
  /** The place, when the first lines of the document say it. */
  description: string | null;
  /** The day, as year-month-day. */
  date: string | null;
  items: DraftItem[];
  serviceChargeCents: Cents | null;
  discountCents: Cents | null;
  /** The total printed on the document. */
  totalCents: Cents | null;
  /** Things the person should look at before accepting the draft. */
  warnings: string[];
};

const MONEY = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const TRAILING_MONEY = new RegExp(String.raw`(?:R[$S5]\s*)?(${MONEY})\s*$`);

const toCents = (text: string): Cents => Math.round(Number(text.replace(/\./g, "").replace(",", ".")) * 100);
const lastMoney = (line: string): Cents | null => {
  const match = line.match(TRAILING_MONEY);
  return match ? toCents(match[1] as string) : null;
};

const NOT_AN_ITEM = /\b(sub\s*-?total|total|troco|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|pix|desconto|servi[cç]o|taxa|gorjeta|pagamento|pago|tributos?|impostos?|acr[eé]scimo|valor|itens?|qtd|qtde)\b/i;
const SERVICE = /(servi[cç]o|gorjeta)/i;

const MONTHS_PATTERN = /\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/;

function readDate(text: string): string | null {
  const match = text.match(MONTHS_PATTERN);
  if (!match) return null;
  const [, day, month, year] = match as unknown as [string, string, string, string];
  const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCMonth() + 1 !== Number(month) ? null : `${year}-${month}-${day}`;
}

const HEADER = /(cnpj|cpf|cupom|nota fiscal|nfc-?e|danfe|documento auxiliar|inscri|endere[cç]o|rua |av\.? |avenida|telefone|fone|www\.|comprovante|via do|via cliente|extrato|pedido|ie:|im:)/i;

function readPlace(lines: string[]): string | null {
  for (const line of lines.slice(0, 6)) {
    const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (letters.length >= 4 && !HEADER.test(line) && !/\d{4,}/.test(line)) {
      return line.replace(/\s+/g, " ").trim().slice(0, 120);
    }
  }
  return null;
}

/** One line of a note: "2 x CERVEJA 10,00 20,00", "001 PIZZA 1 UN 40,00 40,00", "1x Pizza R$ 40,00" or "PIZZA 40,00". */
function readItem(line: string): DraftItem | null {
  const totalCents = lastMoney(line);
  if (totalCents === null || totalCents <= 0 || NOT_AN_ITEM.test(line)) return null;

  let rest = line.replace(TRAILING_MONEY, "").trim();
  const unit = rest.match(new RegExp(String.raw`(?:^|\s)(?:R[$S5]\s*)?(${MONEY})$`));
  const unitCents = unit ? toCents(unit[1] as string) : null;
  if (unit) rest = rest.slice(0, rest.length - unit[0].length).trim();
  rest = rest.replace(/\s*[xX*]\s*$/, "").trim();

  let quantity = "1";
  const trailing = rest.match(/\s(\d+(?:[.,]\d{1,3})?)\s*(?:x|UN|UND|UNID|PC|KG|LT|L)?\.?$/i);
  const leading = rest.match(/^(\d{1,2})\s*[xX]?\s+(?=[A-Za-zÀ-ÿ])/);
  if (trailing && unitCents !== null) {
    quantity = (trailing[1] as string).replace(".", ",").replace(/,0+$/, "");
    rest = rest.slice(0, rest.length - trailing[0].length).trim();
  } else if (leading) {
    quantity = leading[1] as string;
    rest = rest.slice(leading[0].length).trim();
  }
  // A leading code of three or more digits is the product code, not a quantity.
  rest = rest.replace(/^\d{3,}\s+/, "").replace(/^[-–.\s]+|[-–.\s]+$/g, "");

  const letters = rest.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 3) return null;
  return { description: rest.replace(/\s+/g, " ").slice(0, 120), totalCents, quantity };
}

function labelledMoney(lines: string[], label: RegExp, take: "first" | "last"): Cents | null {
  const found: Cents[] = [];
  lines.forEach((line, index) => {
    if (!label.test(line)) return;
    const value = lastMoney(line) ?? (index + 1 < lines.length ? lastMoney(lines[index + 1] as string) : null);
    if (value !== null) found.push(value);
  });
  return found.length === 0 ? null : (take === "first" ? found[0] : found[found.length - 1]) ?? null;
}

const CARD_SLIP = /(cr[eé]dito|d[eé]bito)/i;
const CARD_SLIP_MARKS = /(autoriza[cç][aã]o|nsu|aprovad|via (?:do )?(?:cliente|estabelecimento)|comprovante de venda|transa[cç][aã]o aprovada)/i;

/** Reads the text of a note, a receipt or a card slip into a draft. Whatever it cannot read stays empty. */
export function readBillDocument(text: string): BillDraft {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter((line) => line !== "");
  const items = lines.flatMap((line) => {
    const item = readItem(line);
    return item ? [item] : [];
  });

  const serviceLine = lines.filter((line) => SERVICE.test(line) && lastMoney(line) !== null);
  const serviceChargeCents = serviceLine.length > 0 ? lastMoney(serviceLine[serviceLine.length - 1] as string) : null;
  const discountCents = labelledMoney(lines, /desconto/i, "last");
  const totalCents =
    labelledMoney(lines.filter((line) => !/sub\s*-?total/i.test(line)), /^(?:valor\s+)?total\b|total a pagar|valor a pagar|total geral|^valor\b|^venda\b/i, "last");

  const slip = CARD_SLIP.test(text) && CARD_SLIP_MARKS.test(text);
  const kind: DocumentKind = items.length > 0 && totalCents !== null ? "invoice" : slip && totalCents !== null ? "card_slip" : "unknown";

  const warnings: string[] = [];
  if (kind === "unknown") {
    warnings.push("Não foi possível identificar esta nota. Preencha os dados à mão.");
  }
  if (kind === "invoice") {
    const sum = items.reduce((total, item) => total + item.totalCents, 0) + (serviceChargeCents ?? 0) - (discountCents ?? 0);
    if (totalCents !== null && sum !== totalCents) {
      warnings.push(`A soma dos itens${serviceChargeCents ? " com a taxa" : ""} (${formatCents(sum)}) não bate com o total da nota (${formatCents(totalCents)}). Confira os itens.`);
    }
  }

  return {
    kind,
    description: readPlace(lines),
    date: readDate(text),
    items: kind === "card_slip" ? [] : items,
    serviceChargeCents,
    discountCents,
    totalCents,
    warnings,
  };
}

/**
 * The items of a bill whose total comes from a card slip. What the person described can never pass the
 * total of the slip; what is left is added as one line "Sem descrição", shared out like any other
 * leftover when the bill is closed. The described part is calculated here, never typed.
 */
export function describeUnderTotal(totalCents: Cents, described: DraftItem[]): { items: DraftItem[]; describedCents: Cents; undescribedCents: Cents } {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new DomainError("direct_total_invalid", "Informe o valor da conta, maior que zero.");
  }
  const describedCents = described.reduce((sum, item) => sum + item.totalCents, 0);
  if (describedCents > totalCents) {
    throw new DomainError("described_above_total", `O que foi descrito (${formatCents(describedCents)}) passa do total da nota (${formatCents(totalCents)}).`);
  }
  const undescribedCents = totalCents - describedCents;
  return {
    items: undescribedCents > 0 ? [...described, { description: UNDESCRIBED_LABEL, totalCents: undescribedCents, quantity: "1" }] : described,
    describedCents,
    undescribedCents,
  };
}
