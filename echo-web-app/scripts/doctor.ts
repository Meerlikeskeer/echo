import { loadEnvFile } from "node:process";
import { doctor } from "../src/lib/providers/doctor";

async function main() {
  // Fixture runs must not depend on a local credential file.
  if (process.env.TRANSCRIPTION_PROVIDER !== "fixture" || process.env.LLM_PROVIDER !== "fixture") {
    try { loadEnvFile(".env.local"); } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        console.log("FAIL configuration: unable to load echo-web-app/.env.local");
        process.exitCode = 1;
        return;
      }
    }
  }
  const results = await doctor(process.env);
  for (const result of results) console.log(`${result.ok ? "PASS" : "FAIL"} ${result.port}: ${result.detail}`);
  process.exitCode = results.every((result) => result.ok) ? 0 : 1;
}
main().catch(() => { console.log("FAIL doctor: unexpected diagnostic failure"); process.exitCode = 1; });
