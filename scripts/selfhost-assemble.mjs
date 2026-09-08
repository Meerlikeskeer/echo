import { cp, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ENG-002 / ADR-010. `next build` with `output: "standalone"` emits a server and
// its traced dependencies, but deliberately does NOT copy `.next/static` or
// `public`: on Vercel a CDN serves those, so the bundle leaves them out. A
// self-hosted deployment has no CDN, and a bundle started without this step
// answers 404 for every stylesheet and client script while still rendering HTML
// and returning 200 for the page. That failure looks like a styling bug, not a
// deployment bug, which is why it is a script with a test rather than a line in
// a README that a Dockerfile is trusted to have copied correctly.
//
// This module is the single definition of "assemble a self-hosted bundle". Both
// scripts/selfhost.test.mjs and the Dockerfile call it, so the tested layout and
// the shipped layout cannot drift apart.

const repositoryRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const paths = {
  repositoryRoot,
  standalone: path.join(repositoryRoot, "apps/web/.next/standalone"),
  /** Mirrors the workspace layout because outputFileTracingRoot is the repository root. */
  server: path.join(repositoryRoot, "apps/web/.next/standalone/apps/web/server.js"),
  staticSource: path.join(repositoryRoot, "apps/web/.next/static"),
  staticTarget: path.join(repositoryRoot, "apps/web/.next/standalone/apps/web/.next/static"),
  publicSource: path.join(repositoryRoot, "apps/web/public"),
  publicTarget: path.join(repositoryRoot, "apps/web/.next/standalone/apps/web/public"),
};

const exists = async (target) => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

/**
 * Copies the assets the standalone server needs but does not emit.
 * Throws rather than warning: a partially assembled bundle is worse than no
 * bundle, because it starts successfully and fails only in the browser.
 */
export async function assembleStandalone() {
  if (!(await exists(paths.server))) {
    throw new Error(
      "No standalone server at apps/web/.next/standalone/apps/web/server.js. " +
        "Run `npm run build` first, and check that apps/web/next.config.ts still sets " +
        "`output: \"standalone\"` and `outputFileTracingRoot` to the repository root.",
    );
  }
  if (!(await exists(paths.staticSource))) {
    throw new Error("No apps/web/.next/static to copy. The build did not complete.");
  }

  await cp(paths.staticSource, paths.staticTarget, { recursive: true });

  // `public/` is optional and does not exist today. Copying it unconditionally
  // would make assembly fail the moment someone deletes the last static file,
  // so its absence is reported rather than treated as an error.
  const hasPublic = await exists(paths.publicSource);
  if (hasPublic) await cp(paths.publicSource, paths.publicTarget, { recursive: true });

  return { server: paths.server, copiedStatic: true, copiedPublic: hasPublic };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await assembleStandalone();
  console.log(`selfhost-assemble: .next/static copied${report.copiedPublic ? ", public/ copied" : ", no public/ directory (nothing to copy)"}`);
  console.log(`selfhost-assemble: start with  node ${path.relative(repositoryRoot, report.server)}`);
}
