export type BankNotification = {
  amount: number;
  payerName: string;
  e2eId: string;
  receivedAt: string;
};

export const MOCK_PAYER_NAMES = [
  "ANA CAROLINA SOUZA LIMA",
  "PEDRO HENRIQUE MARTINS ROCHA",
  "JULIANA FERREIRA DOS SANTOS",
  "RAFAEL AUGUSTO NOGUEIRA",
];

// Simulated PSP webhook payload, used only to demo the prototype flow.
export function simulateBankNotification(amount: number): BankNotification {
  return {
    amount,
    payerName:
      MOCK_PAYER_NAMES[Math.floor(Math.random() * MOCK_PAYER_NAMES.length)] ??
      "ANA CAROLINA SOUZA LIMA",
    e2eId: `E${Math.floor(Math.random() * 1e8)
      .toString()
      .padStart(8, "0")}2026091814${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    receivedAt: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}
