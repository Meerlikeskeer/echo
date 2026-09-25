import "server-only";
import { buildProviders, type ProviderSetup } from "./factory";

// Evaluated once when the server module graph is first loaded, so a missing key
// is reported at startup rather than at the first recording. Configuration
// problems do not stop the server: like the WEB-001 access gate, the failure is
// closed and per request — every recording path answers 503 and the UI says so.
export const providerSetup: ProviderSetup = buildProviders(process.env);
