import type { ProviderStatus } from "../lib/providers/status";
import { Recorder } from "./recorder";

export function SessionShell({ status }: { status: ProviderStatus }) {
  return <section aria-label="Echo private workspace"><Recorder status={status} /></section>;
}
