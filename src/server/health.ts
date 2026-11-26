import "server-only";
import { asService, getDb } from "@/db/client";
import { people } from "@/db/schema";

export type DatabaseHealth = { status: "ok"; people: number } | { status: "error" };

async function checkDatabaseImpl(): Promise<DatabaseHealth> {
  try {
    return { status: "ok", people: await getDb().$count(people) };
  } catch {
    return { status: "error" };
  }
}

export function checkDatabase(...args: Parameters<typeof checkDatabaseImpl>) {
  return asService(() => checkDatabaseImpl(...args));
}
