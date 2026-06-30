import "server-only";

import { DEFAULT_AI_MODEL_ID } from "@/lib/ai/model-catalog";
import { readAiSettings, type AiMode } from "@/lib/ai/persistence";
import { decryptSecret } from "@/lib/secret-crypto";

export type ResolvedAiCredential = {
  apiKey: string;
  modelId: string;
  mode: AiMode;
};

// Pick the key + model for an AI call. This fork is BYOK-only; historical
// credits rows are ignored so old data cannot silently select a platform key.
export async function resolveAiCredential(
  client: unknown,
  userId: string
): Promise<ResolvedAiCredential> {
  const row = await readAiSettings(client, userId);
  const encryptedKey = row?.encrypted_api_key;
  if (!encryptedKey || row?.key_status !== "valid") {
    throw new Error("Add an OpenRouter key in Settings");
  }

  return {
    apiKey: decryptSecret(encryptedKey),
    modelId: row?.selected_model_id || DEFAULT_AI_MODEL_ID,
    mode: "byok",
  };
}
