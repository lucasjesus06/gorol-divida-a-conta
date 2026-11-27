export const pixKeyTypes = ["cpf", "cnpj", "phone", "email", "random"] as const;

export type PixKeyType = (typeof pixKeyTypes)[number];
