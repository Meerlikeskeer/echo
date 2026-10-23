import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authConfig } from "./config";
export async function authClient() {
  const config = authConfig(process.env);
  if (config.mode !== "accounts") throw new Error("Account access is not configured.");
  const jar = await cookies();
  return createServerClient(config.url, config.publicKey, {
    cookieOptions: { name: "echo-account-session", httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => {
        // Server Components cannot set cookies. Proxy already refreshes there.
        try { for (const {name, value, options} of values) jar.set(name, value, options); } catch { /* Refreshed by Proxy. */ }
      },
    },
  });
}
