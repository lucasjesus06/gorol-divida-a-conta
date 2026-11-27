import "server-only";
import { headers } from "next/headers";

export async function requestOrigin() {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  if (!host) {
    throw new Error("Requisição sem cabeçalho de host");
  }
  const protocol = list.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}
