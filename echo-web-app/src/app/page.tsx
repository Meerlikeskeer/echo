import { requireOwnerAccess } from "../lib/owner-access";
import { providersFor } from "../lib/auth/credentials";
import { WorkspaceIdentity } from "./workspace-identity";
import { AccountBar } from "./account/account-bar";
import type { ProviderStatus } from "../lib/providers/status";
import { SessionShell } from "./session-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const principal = await requireOwnerAccess();
  const providerSetup = await providersFor(principal);
  const status: ProviderStatus = providerSetup.ok
    ? { ready: true, disclosures: [providerSetup.transcription.disclosure, providerSetup.notes.disclosure] }
    : { ready: false, problems: providerSetup.problems };
  return <WorkspaceIdentity key={principal.id} userId={principal.id}><AccountBar principal={principal} /><SessionShell status={status} /></WorkspaceIdentity>;
}
