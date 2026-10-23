import "server-only";
import { headers } from "next/headers";
import { checkAccess } from "./access";
import { authConfig, identityMatches, sameOrigin } from "./auth/config";
import { authClient } from "./auth/supabase";
export type Principal = { id: string; email?: string };
// Independent page/API boundary check; Proxy alone never authorizes data access.
export async function requireOwnerAccess(): Promise<Principal> {
  const requestHeaders = await headers();
  const config = authConfig(process.env);
  if (config.mode === "accounts") {
    const client = await authClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error("Sign in required");
    // Paid cookie-authenticated API calls must belong to the mounted workspace.
    if (requestHeaders.get("x-echo-user") !== null && !identityMatches(requestHeaders.get("x-echo-user"), user.id)) throw new Error("Account changed; reload Echo");
    return { id: user.id, email: user.email };
  }
  if (config.mode !== "owner" || checkAccess(requestHeaders.get("authorization"), { username: process.env.ECHO_OWNER_USERNAME, password: process.env.ECHO_OWNER_PASSWORD }) !== "allowed") throw new Error("Private access required");
  return { id: "owner" };
}
export async function requireProcessingAccess(): Promise<Principal> {
  const principal = await requireOwnerAccess();
  if (principal.id !== "owner") {
    const incoming = await headers();
    if (!sameOrigin(incoming.get("origin"), authConfig(process.env)) || !identityMatches(incoming.get("x-echo-user"), principal.id)) throw new Error("Workspace access required");
  }
  return principal;
}
