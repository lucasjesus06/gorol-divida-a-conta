export const publicPaths = ["/login", "/pedir-acesso", "/convite", "/entrar", "/status", "/api/cron", "/api/webhooks", "/manifest.webmanifest", "/sw.js"];

export function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
