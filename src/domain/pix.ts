import { DomainError } from "./domain-error";
import { normalizePhone } from "./phone";
import { pixKeyTypes, type PixKeyType } from "./pix-key-types";
import type { Cents } from "./money";

export { pixKeyTypes, type PixKeyType };

export type PixKey = { type: PixKeyType; value: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RANDOM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Validates and normalizes the key as the person typed it, for the chosen type. */
export function normalizePixKey(type: PixKeyType, input: string): PixKey {
  const text = input.trim();
  switch (type) {
    case "cpf": {
      const digits = text.replace(/\D/g, "");
      if (!isValidCpf(digits)) throw invalid("CPF");
      return { type, value: digits };
    }
    case "cnpj": {
      const digits = text.replace(/\D/g, "");
      if (!isValidCnpj(digits)) throw invalid("CNPJ");
      return { type, value: digits };
    }
    case "phone": {
      try {
        return { type, value: normalizePhone(text) };
      } catch {
        throw invalid("celular");
      }
    }
    case "email": {
      const value = text.toLowerCase();
      if (value.length > 77 || !EMAIL.test(value)) throw invalid("e-mail");
      return { type, value };
    }
    case "random": {
      const value = text.toLowerCase();
      if (!RANDOM.test(value)) throw invalid("chave aleatória");
      return { type, value };
    }
  }
}

function invalid(label: string): DomainError {
  return new DomainError("invalid_pix_key", `Confira a chave Pix: o ${label} informado não é válido.`);
}

function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  return checkDigit(digits, 9) === Number(digits[9]) && checkDigit(digits, 10) === Number(digits[10]);

  function checkDigit(source: string, length: number): number {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(source[i]) * (length + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  }
}

function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const weights = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += Number(digits[i]) * (weights[i + 13 - length] as number);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(digits[12]) && digit(13) === Number(digits[13]);
}

/** How the key is shown on screen (the stored value stays plain digits / E.164). */
export function formatPixKey(key: PixKey): string {
  const v = key.value;
  if (key.type === "cpf") return `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}`;
  if (key.type === "cnpj") {
    return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
  }
  return v;
}

function field(id: string, value: string): string {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** The BR Code only accepts uppercase ASCII letters, digits and spaces in these fields. */
function asciiUpper(text: string, max: number, fallback: string): string {
  const clean = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, max)
    .trim();
  return clean || fallback;
}

/**
 * "Pix copia e cola": static BR Code that pays the key with a fixed amount.
 * The merchant name is the receiver's first names; the city is not known, so a
 * neutral value is used (banks only display it).
 */
export function buildPixPayload(input: {
  key: PixKey;
  amountCents: Cents;
  receiverName: string;
}): string {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("invalid_amount", "O valor do Pix deve ser maior que zero.");
  }
  const amount = `${Math.floor(input.amountCents / 100)}.${String(input.amountCents % 100).padStart(2, "0")}`;
  const account = field("00", "br.gov.bcb.pix") + field("01", input.key.value);
  const body =
    field("00", "01") +
    field("01", "12") +
    field("26", account) +
    field("52", "0000") +
    field("53", "986") +
    field("54", amount) +
    field("58", "BR") +
    field("59", asciiUpper(input.receiverName, 25, "GOROLE")) +
    field("60", asciiUpper("Brasil", 15, "BRASIL")) +
    field("62", field("05", "***")) +
    "6304";
  return body + crc16(body);
}

export { crc16 as pixCrc16 };
