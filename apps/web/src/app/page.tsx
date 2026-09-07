import { requireOwnerAccess } from "../lib/owner-access";
import { SessionShell } from "./session-shell";
export default async function Home() {
  await requireOwnerAccess();
  return <SessionShell />;
}
