import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** The private bucket. Nobody reaches it directly: every access goes through a link the server signs. */
export const BUCKET = "arquivos";

const HEAD_BYTES = 16;

let ready: Promise<void> | null = null;

function ensureBucket(): Promise<void> {
  ready ??= (async () => {
    const { error } = await createSupabaseAdminClient().storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`Não foi possível preparar o armazenamento: ${error.message}`);
    }
  })().catch((error: unknown) => {
    ready = null;
    throw error;
  });
  return ready;
}

/** A one-time permission for the browser to send exactly one file to this path. */
export async function createUploadToken(path: string): Promise<string> {
  await ensureBucket();
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    throw new Error(`Não foi possível preparar o envio: ${error?.message ?? "sem resposta"}`);
  }
  return data.token;
}

/** The first bytes and the full size of what was stored, or null when nothing arrived. */
export async function readStored(path: string): Promise<{ head: Uint8Array; sizeBytes: number } | null> {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).download(path);
  if (error || !data) {
    return null;
  }
  return { head: new Uint8Array(await data.slice(0, HEAD_BYTES).arrayBuffer()), sizeBytes: data.size };
}

export async function removeStored(paths: string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  await createSupabaseAdminClient().storage.from(BUCKET).remove(paths);
}

export async function createDownloadUrl(path: string, seconds: number): Promise<string> {
  const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) {
    throw new Error(`Não foi possível abrir o arquivo: ${error?.message ?? "sem resposta"}`);
  }
  return data.signedUrl;
}
