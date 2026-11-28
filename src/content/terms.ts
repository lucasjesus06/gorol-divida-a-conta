/**
 * Text of the terms of use and of the privacy notice shown in the app.
 * It is a DRAFT written in plain language and must be reviewed by a lawyer before the public launch.
 * Whenever it changes, change TERMS_VERSION in src/domain/terms.ts so that everybody accepts again.
 */
export type TermsSection = { title: string; paragraphs: string[] };

export const termsSections: TermsSection[] = [
  {
    title: "O que é o GoRolê",
    paragraphs: [
      "O GoRolê ajuda grupos de amigos a dividir despesas de rolês e a acertar o que cada um deve, com o menor número de Pix possível.",
      "O GoRolê não movimenta dinheiro. Os pagamentos são feitos por fora, pelo seu banco, e registrados aqui.",
    ],
  },
  {
    title: "Seus dados",
    paragraphs: [
      "Guardamos o seu nome, telefone, e-mail, a chave Pix que você cadastra, as despesas e os pagamentos em que você participa e, se você quiser, a sua foto.",
      "A sua chave Pix só aparece para quem deve dinheiro a você, e só na hora de pagar. O seu telefone só aparece para você e para o dono do rolê em que você participa. A sua foto só aparece para quem divide rolê com você.",
      "Usamos esses dados apenas para o funcionamento do GoRolê: calcular saldos, mostrar o que cada um deve, avisar você e cobrar o que está em aberto. Não vendemos os seus dados.",
    ],
  },
  {
    title: "Lembretes de pagamento",
    paragraphs: [
      "Quando você deve dinheiro a alguém, o GoRolê pode lembrar você, por aviso no aplicativo e por mensagem de WhatsApp enviada pela administração do GoRolê, em tom amigável e em horário comercial, até o pagamento ser confirmado.",
      "Os lembretes são uma função do aplicativo, e não propaganda. Você pode retirar o seu consentimento a qualquer momento em Configurações, Privacidade. Retirar o consentimento para os lembretes não apaga a dívida: ela continua registrada entre vocês.",
    ],
  },
  {
    title: "Regras de uso",
    paragraphs: [
      "Registre só despesas verdadeiras e informações suas. Quem lança uma despesa responde por ela, e qualquer participante pode contestá-la.",
      "O histórico financeiro não é apagado nem reescrito: correções criam uma nova versão, e a versão anterior continua visível a quem participou.",
      "Você pode deixar de usar o GoRolê quando quiser, mas o que já foi registrado entre você e outras pessoas continua no histórico delas.",
    ],
  },
  {
    title: "Mudanças nestes termos",
    paragraphs: ["Se estes termos mudarem, o GoRolê pede que você leia e aceite de novo antes de continuar usando."],
  },
];
