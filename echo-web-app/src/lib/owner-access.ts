import "server-only";
import { headers } from "next/headers";
import { checkAccess } from "./access";

// Check again at the server rendering boundary, independently of Proxy.
// Future data access and mutation functions must call this guard themselves.
export async function requireOwnerAccess(): Promise<void> {
  const requestHeaders = await headers();
  if (checkAccess(requestHeaders.get("authorization"), {
    username: process.env.ECHO_OWNER_USERNAME,
    password: process.env.ECHO_OWNER_PASSWORD,
  }) !== "allowed") throw new Error("Private access required");
}
