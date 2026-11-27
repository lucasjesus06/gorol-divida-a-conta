import { describe, expect, it } from "vitest";
import { isPublicPath } from "./public-paths";

describe("isPublicPath", () => {
  it.each(["/login", "/pedir-acesso", "/convite/abc", "/status", "/api/cron/cobranca", "/api/webhooks/whatsapp", "/manifest.webmanifest", "/sw.js"])(
    "%s abre sem sessão",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
    },
  );

  it.each(["/", "/perfil", "/rolês/1", "/loginx", "/admin", "/convites", "/api/exportacao", "/status-secreto", "/sw.json"])(
    "%s exige sessão",
    (path) => {
      expect(isPublicPath(path)).toBe(false);
    },
  );
});
