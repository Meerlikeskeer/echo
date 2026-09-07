import { requireOwnerAccess } from "../lib/owner-access";
import { providerSetup } from "../lib/providers/registry";
import type { ProviderStatus } from "../lib/providers/status";
import { SessionShell } from "./session-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireOwnerAccess();
  const status: ProviderStatus = providerSetup.ok
    ? { ready: true, disclosures: [providerSetup.transcription.disclosure, providerSetup.notes.disclosure] }
    : { ready: false, problems: providerSetup.problems };
  return <SessionShell status={status} />;
}
