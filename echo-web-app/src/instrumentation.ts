/** Next.js startup hook. Reports provider configuration problems once, by
 *  variable name only, so the owner learns before recording instead of after. */
export async function register(): Promise<void> {
  const { providerSetup } = await import("./lib/providers/registry");
  if (providerSetup.ok) return;
  console.warn(
    `[echo] recording is disabled until provider configuration is complete:\n  - ${providerSetup.problems.join("\n  - ")}\n` +
      "  (this reflects configuration at startup; restart the server after editing echo-web-app/.env.local)",
  );
}
