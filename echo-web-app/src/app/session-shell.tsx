import type { ProviderStatus } from "../lib/providers/status";
import { Recorder } from "./recorder";

export function SessionShell({ status }: { status: ProviderStatus }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-16 sm:px-10">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Echo · Private workspace</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Record a note</h1>
        <p className="mt-3 max-w-xl leading-7 text-slate-600">Record a meeting, a conversation or a thought—or import a recording from your Echo device. Echo saves playable chunks in this browser and transcribes them while you record, so a long session is already most of the way transcribed when you stop. Saved audio and results can recover here; browser storage can still be cleared or evicted.</p>
      </header>
      <Recorder status={status} />
    </main>
  );
}
