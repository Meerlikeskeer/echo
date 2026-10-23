import "server-only";
import { authClient } from "./supabase";
import { decryptKeys } from "./credential-crypto";
import { buildProviders, type ProviderSetup } from "../providers/factory";
import { providerSetup } from "../providers/registry";
import type { Principal } from "../owner-access";
export async function providersFor(principal: Principal): Promise<ProviderSetup> {
  if (principal.id === "owner") return providerSetup;
  try {
    const client = await authClient();
    const { data, error } = await client.from("provider_credentials").select("encrypted_keys").eq("user_id", principal.id).maybeSingle();
    if (error || !data) return { ok: false, problems: ["Add your transcription and notes API keys in Account settings."] };
    const keys = decryptKeys(principal.id, data.encrypted_keys, process.env.ECHO_CREDENTIAL_ENCRYPTION_KEY);
    // Explicitly replace BOTH keys and adapters. Never inherit platform keys or fixtures.
    return buildProviders({ ...process.env, TRANSCRIPTION_PROVIDER: "openai-compatible", LLM_PROVIDER: "openai-compatible", TRANSCRIPTION_API_KEY: keys.transcription, LLM_API_KEY: keys.notes });
  } catch { return { ok: false, problems: ["Personal provider keys could not be loaded. Check Account settings or contact the owner."] }; }
}
