import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["(11) 99999-0001", "+5511999990001"],
    ["11999990001", "+5511999990001"],
    ["1133334444", "+551133334444"],
    ["+55 11 99999-0001", "+5511999990001"],
    ["5511999990001", "+5511999990001"],
    ["0055 11 99999-0001", "+5511999990001"],
    ["+1 415 555 0100", "+14155550100"],
    ["  +351 912 345 678 ", "+351912345678"],
  ])("normaliza %s para %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it("o mesmo telefone escrito de jeitos diferentes vira o mesmo valor", () => {
    expect(normalizePhone("(11) 99999-0001")).toBe(normalizePhone("+55 11 99999 0001"));
  });

  it.each(["", "abc", "123", "+0 11 99999 0001", "(11) 9999-000", "+55"])("recusa %j", (input) => {
    expect(() => normalizePhone(input)).toThrowError(expect.objectContaining({ code: "invalid_phone" }));
  });
});
