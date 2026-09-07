import type { ProviderStatus } from "../lib/providers/status";
import { Recorder } from "./recorder";

export function SessionShell({ status }: { status: ProviderStatus }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16 sm:px-10">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Echo · Private workspace</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Record a note</h1>
        <p className="mt-3 max-w-xl leading-7 text-slate-600">Record a short session. Echo keeps playable chunks in this page and transcribes each after you stop. Nothing is saved beyond this page yet.</p>
      </header>
      <Recorder status={status} />
    </main>
  );
}
