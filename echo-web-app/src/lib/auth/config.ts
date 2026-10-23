export type AuthConfig = { mode: "owner" } | { mode: "accounts"; url: string; publicKey: string; origin: string } | { mode: "invalid" };
export function authConfig(env: Readonly<Record<string, string | undefined>>): AuthConfig {
  if (!env.ECHO_AUTH_MODE || env.ECHO_AUTH_MODE === "owner") return { mode: "owner" };
  if (env.ECHO_AUTH_MODE !== "accounts") return { mode: "invalid" };
  try {
    const url = new URL(env.SUPABASE_URL ?? "");
    const app = new URL(env.ECHO_APP_URL ?? "");
    const secure = (value: URL) => value.protocol === "https:" || value.protocol === "http:" && ["localhost", "127.0.0.1"].includes(value.hostname);
    if (!secure(url) || !secure(app) || url.username || url.password || app.username || app.password || app.pathname !== "/" || app.search || app.hash || !env.SUPABASE_PUBLISHABLE_KEY?.trim()) return { mode: "invalid" };
    return { mode: "accounts", url: url.origin, publicKey: env.SUPABASE_PUBLISHABLE_KEY.trim(), origin: app.origin };
  } catch { return { mode: "invalid" }; }
}
export function sameOrigin(origin: string | null, config: AuthConfig): boolean { return config.mode === "accounts" && origin === config.origin; }
export function identityMatches(expected: string | null, actual: string): boolean { return expected === actual; }
export function browserNamespace(userId: string): string {
  if (userId === "owner") return "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) throw new Error("Invalid account identity");
  return `account-${userId}/`;
}

export function accountMutationAllowed(config: AuthConfig, origin: string | null, expectedUser: string | null, actualUser: string): boolean {
  return sameOrigin(origin,config) && identityMatches(expectedUser,actualUser);
}
