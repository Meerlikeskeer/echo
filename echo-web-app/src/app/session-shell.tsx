import type { ProviderStatus } from "../lib/providers/status";
import { Recorder } from "./recorder";

export function SessionShell({ status }: { status: ProviderStatus }) {
  return <Recorder status={status} />;
}
