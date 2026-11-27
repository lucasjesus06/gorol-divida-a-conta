export const publicPaths = ["/login", "/status", "/api/cron", "/api/webhooks", "/manifest.webmanifest", "/sw.js"];

export function isPublicPath(pathname: string) {
  return publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
