import type { ProviderDisclosure } from "./types";

/** Serializable provider state handed from the server render to the client. */
export type ProviderStatus =
  | { readonly ready: true; readonly disclosures: readonly ProviderDisclosure[] }
  | { readonly ready: false; readonly problems: readonly string[] };
