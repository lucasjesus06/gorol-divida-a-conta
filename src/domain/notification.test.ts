import { describe, expect, it } from "vitest";
import { billPartTransferred, closingVoteRequested, outingReopened, closingVoteResolved, guestRequestedAccount, joinRequested, outingClosed, participantLeft, participantRemoved, paymentDeclared, paymentReminder } from "./notification";

const outingId = "11111111-1111-4111-8111-111111111111";

describe("avisos", () => {
  it("monta o aviso de pagamento declarado com o valor formatado e o destino", () => {
    const notice = paymentDeclared({ fromName: "Maria", amountCents: 2550, outingId, outingName: "Churrasco" });
    expect(notice.kind).toBe("payment_declared");
    expect(notice.body).toContain("R$");
    expect(notice.body).toContain("25,50");
    expect(notice.url).toBe(`/roles/${outingId}?visao=pagamentos`);
  });

  it("leva o dono à lista de participantes nos pedidos de cadastro e de entrada", () => {
    expect(guestRequestedAccount({ guestName: "Edu", outingId, outingName: "Churrasco" }).url).toBe(`/roles/${outingId}?visao=participantes`);
    expect(joinRequested({ personName: "Edu", outingId, outingName: "Churrasco" }).body).toBe("Edu quer entrar em Churrasco.");
  });

  it("leva direto à conta quando uma parte é transferida", () => {
    const notice = billPartTransferred({ fromName: "Caio", billName: "Picanha", outingId, billId: "b1" });
    expect(notice.url).toBe(`/roles/${outingId}/contas/b1`);
    expect(notice.body).toContain("Picanha");
  });

  it("encurta nomes enormes e nunca deixa quebra de linha no texto", () => {
    const notice = joinRequested({ personName: `${"A".repeat(300)}\nB`, outingId, outingName: "X" });
    expect(notice.body.length).toBeLessThanOrEqual(200);
    expect(notice.body).not.toContain("\n");
  });

  it("o lembrete leva o devedor ao resumo da relação com o credor", () => {
    const notice = paymentReminder({ creditorId: "c1", creditorName: "Lucas", amountCents: 5000 });
    expect(notice.url).toBe("/resumo/c1");
    expect(notice.body).toContain("50,00");
  });

  it("avisos de encerramento e saída levam ao rolê ou à lista de rolês", () => {
    expect(outingClosed({ outingId, outingName: "Churrasco" }).url).toBe(`/roles/${outingId}`);
    expect(participantRemoved({ outingName: "Churrasco" }).url).toBe("/roles");
    expect(participantLeft({ personName: "Maria", outingId, outingName: "Churrasco" }).url).toBe(`/roles/${outingId}?visao=participantes`);
  });

  it("avisos da votação de encerramento explicam o prazo e o resultado", () => {
    expect(closingVoteRequested({ outingId, outingName: "Churrasco", ownerName: "Lucas", days: 5 }).body).toContain("5 dias");
    expect(closingVoteResolved({ outingId, outingName: "Churrasco", result: "approved" }).title).toBe("Rolê encerrado");
    expect(closingVoteResolved({ outingId, outingName: "Churrasco", result: "rejected" }).body).toContain("continua aberto");
    expect(closingVoteResolved({ outingId, outingName: "Churrasco", result: "cancelled" }).body).toContain("mudaram");
  });

  it("o aviso de reabertura nomeia quem contestou e leva ao rolê", () => {
    const notice = outingReopened({ outingId, outingName: "Churrasco", personName: "Maria" });
    expect(notice.url).toBe(`/roles/${outingId}`);
    expect(notice.body).toContain("Maria");
    expect(notice.body).toContain("reaberto");
  });
});
