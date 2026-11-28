import { describe, expect, it } from "vitest";
import { compareReceipt, isPixReceiptText, namesMatch, readPixReceipt } from "./pix-receipt";

const E2E = "E60701190202611281432AbC9dEf3Gh1";

// Textos de exemplo escritos à mão no formato que os bancos costumam usar; não são comprovantes reais.
const nubank = `Comprovante de transferência
28 NOV 2026 - 14:32:10
Valor
R$ 45,00
Tipo de transferência
Pix
Destino
Nome
Maria Silva Santos
CPF
***.123.456-**
Instituição
Banco Exemplo S.A.
Origem
Nome
Lucas Jesus
ID da transação
${E2E}`;

const itau = `comprovante de pagamento pix
data da transferência: 28/11/2026
valor: R$ 1.250,90
para: MARIA SILVA SANTOS
chave: maria@exemplo.com
id da transação: ${E2E.slice(0, 12)} ${E2E.slice(12, 24)} ${E2E.slice(24)}`;

const declared = { amountCents: 4500, recipientName: "Maria", declaredAt: new Date("2026-11-28T18:00:00Z") };
const fine = { isPixReceipt: true, codeAlreadyUsed: false };

describe("readPixReceipt", () => {
  it("lê valor, data, destinatário e código de um comprovante em linhas separadas", () => {
    expect(readPixReceipt(nubank)).toEqual({ amountCents: 4500, date: "2026-11-28", recipientName: "Maria Silva Santos", transactionId: E2E });
  });

  it("lê valor com milhar, data numérica e o código quebrado em espaços", () => {
    expect(readPixReceipt(itau)).toEqual({ amountCents: 125090, date: "2026-11-28", recipientName: "MARIA SILVA SANTOS", transactionId: E2E });
  });

  it("aceita o R$ lido como RS e usa a data do código quando o texto não tem data", () => {
    const reading = readPixReceipt(`Pix enviado\nValor RS 12,50\nNome: João Pereira\n${E2E}`);
    expect(reading).toMatchObject({ amountCents: 1250, date: "2026-11-28", transactionId: E2E });
  });

  it("o que não dá para ler fica nulo", () => {
    expect(readPixReceipt("foto borrada\nxxxx")).toEqual({ amountCents: null, date: null, recipientName: null, transactionId: null });
  });

  it("não confunde instituição ou CPF com o nome", () => {
    expect(readPixReceipt("Destino\nInstituição\nBanco Exemplo S.A.\nCPF\n***.123.456-**\nValor R$ 10,00").recipientName).toBeNull();
  });
});

describe("isPixReceiptText", () => {
  it("aceita comprovante de Pix e recusa outro documento", () => {
    expect(isPixReceiptText(nubank)).toBe(true);
    expect(isPixReceiptText(itau)).toBe(true);
    expect(isPixReceiptText("CUPOM FISCAL\nPizza 40,00\nTOTAL R$ 40,00")).toBe(false);
    expect(isPixReceiptText("Comprovante de pagamento de boleto R$ 10,00")).toBe(false);
  });
});

describe("namesMatch", () => {
  it("basta um nome em comum, sem acento e sem diferença de maiúsculas", () => {
    expect(namesMatch("MARIA SILVA SANTOS", "Maria")).toBe(true);
    expect(namesMatch("José da Conceição", "jose")).toBe(true);
    expect(namesMatch("Carlos Pereira", "Maria")).toBe(false);
  });
});

describe("compareReceipt", () => {
  it("tudo coerente: pode dar baixa sozinho", () => {
    expect(compareReceipt(readPixReceipt(nubank), declared, fine)).toEqual({ ok: true, issues: [] });
  });

  it("valor diferente lista os dois valores", () => {
    const result = compareReceipt({ ...readPixReceipt(nubank), amountCents: 4000 }, declared, fine);
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([{ code: "amount_differs", message: "O comprovante mostra R$ 40,00, mas o pagamento declarado é de R$ 45,00." }]);
  });

  it("destinatário diferente mostra quem estava no comprovante e quem foi declarado", () => {
    const result = compareReceipt({ ...readPixReceipt(nubank), recipientName: "Carlos Pereira" }, declared, fine);
    expect(result.issues.map((issue) => issue.code)).toEqual(["recipient_differs"]);
    expect(result.issues[0]?.message).toContain("Carlos Pereira");
    expect(result.issues[0]?.message).toContain("Maria");
  });

  it("data de depois da declaração ou muito antiga é inconsistente", () => {
    const after = compareReceipt({ ...readPixReceipt(nubank), date: "2026-12-05" }, declared, fine);
    expect(after.issues.map((issue) => issue.code)).toEqual(["date_after_payment"]);
    const old = compareReceipt({ ...readPixReceipt(nubank), date: "2026-09-01" }, declared, fine);
    expect(old.issues.map((issue) => issue.code)).toEqual(["date_too_old"]);
  });

  it("um dia depois ainda passa, por causa do fuso", () => {
    expect(compareReceipt({ ...readPixReceipt(nubank), date: "2026-11-29" }, declared, fine).ok).toBe(true);
  });

  it("código já usado, outro documento e campos ilegíveis aparecem todos de uma vez", () => {
    const result = compareReceipt(readPixReceipt("xxxx"), declared, { isPixReceipt: false, codeAlreadyUsed: false });
    expect(result.issues.map((issue) => issue.code)).toEqual(["not_a_pix_receipt", "amount_unreadable", "recipient_unreadable", "date_unreadable", "code_unreadable"]);
    expect(compareReceipt(readPixReceipt(nubank), declared, { ...fine, codeAlreadyUsed: true }).issues.map((issue) => issue.code)).toEqual(["code_already_used"]);
  });
});
