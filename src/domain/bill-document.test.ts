import { describe, expect, it } from "vitest";
import { formatCents } from "./money";
import { UNDESCRIBED_LABEL, describeUnderTotal, readBillDocument } from "./bill-document";

// Textos de exemplo escritos à mão no formato que notas e maquininhas costumam ter; não são documentos reais.
const cupom = `BAR DO ZÉ LTDA
CNPJ 12.345.678/0001-90
RUA DAS FLORES 100 - CENTRO
CUPOM FISCAL
12/11/2026 21:40
PIZZA MARGUERITA 40,00
2 x CERVEJA LONG NECK 10,00 20,00
1 PORCAO BATATA FRITA 28,50
SUBTOTAL 88,50
SERVIÇO 10% 8,85
DESCONTO 5,00
TOTAL R$ 92,35
DINHEIRO 100,00
TROCO 7,65`;

const nfce = `RESTAURANTE SABOR CASEIRO
DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
CNPJ: 98.765.432/0001-10
COD DESCRIÇÃO QTD UN VL UNIT VL TOTAL
001 FILE A PARMEGIANA 1 UN 54,90 54,90
002 SUCO DE LARANJA 2 UN 9,00 18,00
003 AGUA SEM GAS 3 UN 5,00 15,00
VALOR TOTAL R$ 87,90
FORMA PAGAMENTO CARTÃO DE CRÉDITO 87,90
CHAVE DE ACESSO 3526 1112 3456 7800 0190 6500 1000 0000 0112 3456 7890
Data de emissão 12/11/2026`;

const maquininha = `LOJA EXEMPLO
COMPROVANTE DE VENDA
VIA CLIENTE
CREDITO A VISTA
VALOR: R$ 120,00
CARTAO ****1234
AUTORIZACAO 123456
NSU 000987
TRANSACAO APROVADA
12/11/2026 22:15`;

const delivery = `Pizzaria do Bairro
Pedido #4821 - 12/11/2026
1x Pizza Calabresa R$ 45,00
2x Refrigerante 2L R$ 9,00
Taxa de entrega R$ 6,00
Total R$ 63,00`;

describe("readBillDocument: nota com itens", () => {
  it("lê o lugar, a data, os itens com quantidade, a taxa, o desconto e o total", () => {
    const draft = readBillDocument(cupom);
    expect(draft.kind).toBe("invoice");
    expect(draft.description).toBe("BAR DO ZÉ LTDA");
    expect(draft.date).toBe("2026-11-12");
    expect(draft.items).toEqual([
      { description: "PIZZA MARGUERITA", totalCents: 4000, quantity: "1" },
      { description: "CERVEJA LONG NECK", totalCents: 2000, quantity: "2" },
      { description: "PORCAO BATATA FRITA", totalCents: 2850, quantity: "1" },
    ]);
    expect(draft.serviceChargeCents).toBe(885);
    expect(draft.discountCents).toBe(500);
    expect(draft.totalCents).toBe(9235);
    expect(draft.warnings).toEqual([]);
  });

  it("lê as colunas de uma NFC-e: código, quantidade, unidade, valor unitário e total", () => {
    const draft = readBillDocument(nfce);
    expect(draft.kind).toBe("invoice");
    expect(draft.description).toBe("RESTAURANTE SABOR CASEIRO");
    expect(draft.items).toEqual([
      { description: "FILE A PARMEGIANA", totalCents: 5490, quantity: "1" },
      { description: "SUCO DE LARANJA", totalCents: 1800, quantity: "2" },
      { description: "AGUA SEM GAS", totalCents: 1500, quantity: "3" },
    ]);
    expect(draft.totalCents).toBe(8790);
    expect(draft.date).toBe("2026-11-12");
    expect(draft.warnings).toEqual([]);
  });

  it("lê um print de pedido de delivery com R$ nos preços", () => {
    const draft = readBillDocument(delivery);
    expect(draft.kind).toBe("invoice");
    expect(draft.description).toBe("Pizzaria do Bairro");
    expect(draft.items.map((item) => [item.description, item.totalCents, item.quantity])).toEqual([
      ["Pizza Calabresa", 4500, "1"],
      ["Refrigerante 2L", 900, "2"],
    ]);
    expect(draft.totalCents).toBe(6300);
  });

  it("avisa quando a soma dos itens não bate com o total", () => {
    const draft = readBillDocument(cupom.replace("PIZZA MARGUERITA 40,00", "PIZZA MARGUERITA 30,00"));
    expect(draft.warnings).toEqual([`A soma dos itens com a taxa (${formatCents(8235)}) não bate com o total da nota (${formatCents(9235)}). Confira os itens.`]);
  });
});

describe("readBillDocument: maquininha e o que não se reconhece", () => {
  it("o comprovante da maquininha traz só o total, sem itens", () => {
    const draft = readBillDocument(maquininha);
    expect(draft).toMatchObject({ kind: "card_slip", items: [], totalCents: 12000, date: "2026-11-12", warnings: [] });
  });

  it("outro documento volta vazio, pedindo para preencher à mão", () => {
    const draft = readBillDocument("foto tremida\nxxxx\n--");
    expect(draft).toMatchObject({ kind: "unknown", items: [], totalCents: null });
    expect(draft.warnings[0]).toContain("Preencha");
  });
});

describe("describeUnderTotal", () => {
  const described = [{ description: "Pizza", totalCents: 4000, quantity: "1" }];

  it("a diferença entre o total da nota e o descrito entra como uma linha própria", () => {
    expect(describeUnderTotal(12000, described)).toEqual({
      items: [...described, { description: UNDESCRIBED_LABEL, totalCents: 8000, quantity: "1" }],
      describedCents: 4000,
      undescribedCents: 8000,
    });
  });

  it("descrever tudo não cria linha de diferença", () => {
    expect(describeUnderTotal(4000, described)).toEqual({ items: described, describedCents: 4000, undescribedCents: 0 });
  });

  it("sem nada descrito, o total inteiro fica sem descrição", () => {
    expect(describeUnderTotal(12000, []).items).toEqual([{ description: UNDESCRIBED_LABEL, totalCents: 12000, quantity: "1" }]);
  });

  it("descrever mais que o total da nota é recusado, com os dois valores", () => {
    expect(() => describeUnderTotal(3000, described)).toThrowError(expect.objectContaining({ code: "described_above_total", message: `O que foi descrito (${formatCents(4000)}) passa do total da nota (${formatCents(3000)}).` }));
  });

  it("total inválido é recusado", () => {
    expect(() => describeUnderTotal(0, [])).toThrowError(expect.objectContaining({ code: "direct_total_invalid" }));
  });
});
