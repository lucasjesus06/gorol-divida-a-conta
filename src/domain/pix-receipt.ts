import type { Cents } from "./money";

/** What could be read from a Pix receipt. A field that could not be read is null; nothing here is trusted yet. */
export type PixReceiptReading = {
  amountCents: Cents | null;
  /** Calendar day of the transfer, as year-month-day. */
  date: string | null;
  recipientName: string | null;
  /** The unique code of the Pix (end-to-end id): no two payments can use the same one. */
  transactionId: string | null;
};

export type ReceiptIssueCode =
  | "not_a_pix_receipt"
  | "amount_unreadable"
  | "amount_differs"
  | "recipient_unreadable"
  | "recipient_differs"
  | "date_unreadable"
  | "date_after_payment"
  | "date_too_old"
  | "code_unreadable"
  | "code_already_used";

export type ReceiptIssue = { code: ReceiptIssueCode; message: string };

/** The receipt may be this many days older than the declaration, and at most one day newer. */
export const RECEIPT_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS: Record<string, string> = {
  jan: "01", fev: "02", mar: "03", abr: "04", mai: "05", jun: "06", jul: "07", ago: "08", set: "09", out: "10", nov: "11", dez: "12",
  janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12",
};

const strip = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** The Pix end-to-end id: E or D, 8 digits of the bank, 12 of the date and time, 11 letters or digits. */
const TRANSACTION_ID = /[ED]\d{8}\d{12}[A-Za-z0-9]{11}/;

function readTransactionId(text: string): string | null {
  const direct = text.match(new RegExp(`\\b(${TRANSACTION_ID.source})\\b`));
  if (direct) {
    return direct[1] as string;
  }
  // Optical reading often breaks the long code with spaces: look again on the lines that talk about it.
  for (const line of text.split("\n")) {
    if (/\bid\b|transa[cç]|autentica|c[oó]digo/i.test(line)) {
      const joined = line.replace(/[^A-Za-z0-9]/g, "");
      const found = joined.match(TRANSACTION_ID);
      if (found && found[0].length === 32) {
        return found[0];
      }
    }
  }
  return null;
}

function toCents(text: string): Cents | null {
  const normalized = text.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
}

function readAmount(text: string): Cents | null {
  // "R$" is often read as "RS" or "R5".
  const labelled = text.match(/valor[^\n\d]{0,25}R[$S5]?\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const any = text.match(/R[$S5]\s*(\d{1,3}(?:\.\d{3})*,\d{2})/);
  const found = labelled?.[1] ?? any?.[1];
  return found ? toCents(found) : null;
}

function isoDate(year: string, month: string, day: string): string | null {
  const date = new Date(`${year}-${month}-${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.getUTCMonth() + 1 !== Number(month) ? null : `${year}-${month}-${day}`;
}

function readDate(text: string, transactionId: string | null): string | null {
  const numeric = text.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
  if (numeric) {
    return isoDate(numeric[3] as string, numeric[2] as string, numeric[1] as string);
  }
  const written = strip(text).match(/\b(\d{1,2})\s*(?:de\s+)?([A-Za-z]{3,9})\.?\s*(?:de\s+)?(\d{4})\b/);
  if (written) {
    const month = MONTHS[(written[2] as string).toLowerCase()];
    if (month) {
      return isoDate(written[3] as string, month, (written[1] as string).padStart(2, "0"));
    }
  }
  if (transactionId) {
    // The code carries the date and time (in UTC) at which the Pix was made.
    return isoDate(transactionId.slice(9, 13), transactionId.slice(13, 15), transactionId.slice(15, 17));
  }
  return null;
}


function looksLikeName(text: string): boolean {
  const words = text.trim().split(/\s+/).filter((word) => /^[A-Za-zÀ-ÿ'.-]{2,}$/.test(word));
  return words.length >= 2 && !/(banco|ag[eê]ncia|conta|cpf|cnpj|chave|institui)/i.test(text);
}

function readRecipient(text: string): string | null {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const labelled = lines[index]?.match(/^\s*(?:nome(?: do (?:recebedor|favorecido|destinat[aá]rio))?|favorecido|recebedor|destinat[aá]rio|para|destino|quem recebeu)\s*:?\s*(.*)$/i);
    if (!labelled) continue;
    const sameLine = (labelled[1] ?? "").trim();
    if (looksLikeName(sameLine)) return sameLine;
    // The name may sit on the next line, or after a "Nome" line that follows a "Destino" heading.
    for (const next of lines.slice(index + 1, index + 4)) {
      const candidate = next.replace(/^\s*nome\s*:?\s*/i, "").trim();
      if (looksLikeName(candidate)) return candidate;
    }
  }
  return null;
}

/** Whether the text looks like a Pix receipt at all: other documents are refused. */
export function isPixReceiptText(text: string): boolean {
  return /pix/i.test(text) && (TRANSACTION_ID.test(text.replace(/\s/g, "")) || /comprovante|transfer[eê]ncia|pagamento/i.test(text));
}

/** Turns the text read from a receipt into fields; what could not be read stays null. */
export function readPixReceipt(text: string): PixReceiptReading {
  const clean = text.replace(/\r/g, "");
  const transactionId = readTransactionId(clean);
  return {
    amountCents: readAmount(clean),
    date: readDate(clean, transactionId),
    recipientName: readRecipient(clean),
    transactionId,
  };
}

const tokens = (name: string) => strip(name).toUpperCase().split(/[^A-Z]+/).filter((token) => token.length >= 2);

/** The bank shows the full name and the app may only know a first name or a nickname: one name in common is enough. */
export function namesMatch(recipient: string, personName: string): boolean {
  const wanted = new Set(tokens(personName));
  return tokens(recipient).some((token) => wanted.has(token));
}

const money = (cents: Cents) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
const brDate = (iso: string) => iso.split("-").reverse().join("/");

export type ReceiptComparison = { ok: boolean; issues: ReceiptIssue[] };

/**
 * Compares what was read with what the payer declared. Every difference is listed with the
 * two values, so the creditor sees exactly why the receipt did not settle the payment by itself.
 */
export function compareReceipt(
  reading: PixReceiptReading,
  declared: { amountCents: Cents; recipientName: string; declaredAt: Date },
  context: { isPixReceipt: boolean; codeAlreadyUsed: boolean },
): ReceiptComparison {
  const issues: ReceiptIssue[] = [];
  const add = (code: ReceiptIssueCode, message: string) => issues.push({ code, message });

  if (!context.isPixReceipt) {
    add("not_a_pix_receipt", "O arquivo não parece um comprovante de Pix.");
  }

  if (reading.amountCents === null) {
    add("amount_unreadable", "Não foi possível ler o valor no comprovante.");
  } else if (reading.amountCents !== declared.amountCents) {
    add("amount_differs", `O comprovante mostra ${money(reading.amountCents)}, mas o pagamento declarado é de ${money(declared.amountCents)}.`);
  }

  if (reading.recipientName === null) {
    add("recipient_unreadable", "Não foi possível ler quem recebeu no comprovante.");
  } else if (!namesMatch(reading.recipientName, declared.recipientName)) {
    add("recipient_differs", `O comprovante mostra o destinatário "${reading.recipientName}", mas o pagamento foi declarado para ${declared.recipientName}.`);
  }

  if (reading.date === null) {
    add("date_unreadable", "Não foi possível ler a data no comprovante.");
  } else {
    const at = new Date(`${reading.date}T12:00:00Z`).getTime();
    const declaredDay = new Date(`${declared.declaredAt.toISOString().slice(0, 10)}T12:00:00Z`).getTime();
    if (at - declaredDay > DAY_MS) {
      add("date_after_payment", `A data do comprovante (${brDate(reading.date)}) é depois de o pagamento ser declarado.`);
    } else if (declaredDay - at > RECEIPT_MAX_AGE_DAYS * DAY_MS) {
      add("date_too_old", `A data do comprovante (${brDate(reading.date)}) é de mais de ${RECEIPT_MAX_AGE_DAYS} dias antes do pagamento declarado.`);
    }
  }

  if (reading.transactionId === null) {
    add("code_unreadable", "Não foi possível ler o código da transação (ID do Pix).");
  } else if (context.codeAlreadyUsed) {
    add("code_already_used", "Este comprovante já foi usado em outro pagamento.");
  }

  return { ok: issues.length === 0, issues };
}
