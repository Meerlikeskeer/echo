import { readPort, type Environment } from "./config";
import type { ProviderPort } from "./types";

export interface DoctorResult { port: ProviderPort; ok: boolean; detail: string }

/** Credential probe only: no inference, audio, response bodies or error text. */
export async function doctor(env: Environment, fetchImpl = globalThis.fetch): Promise<DoctorResult[]> {
  return Promise.all((["transcription", "notes"] as const).map(async (port) => {
    const problems: string[] = [];
    const settings = readPort(env, port, problems);
    if (!settings || problems.length) return { port, ok: false, detail: problems.join(" ") };
    if (settings.adapter === "fixture") return { port, ok: true, detail: "fixture (offline; no credential required)" };
    const prefix = port === "transcription" ? "TRANSCRIPTION" : "LLM";
    try {
      const response = await fetchImpl(`${settings.baseUrl}/models`, {
        headers: { authorization: `Bearer ${settings.apiKey}` },
        signal: AbortSignal.timeout(10_000), redirect: "error",
      });
      await response.body?.cancel();
      if (response.ok) return { port, ok: true, detail: `${prefix}_API_KEY accepted; inference/model access not tested` };
      const variable = response.status === 401 || response.status === 403 ? `${prefix}_API_KEY` : `${prefix}_BASE_URL`;
      return { port, ok: false, detail: `${variable}: HTTP ${response.status}; ${response.status === 401 || response.status === 403 ? "credential rejected" : "probe failed; check endpoint, availability and account limits"}` };
    } catch {
      return { port, ok: false, detail: `${prefix}_BASE_URL: request failed or timed out` };
    }
  }));
}
