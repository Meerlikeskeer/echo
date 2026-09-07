export function SessionShell() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-16 sm:px-10">
      <header className="mb-16 border-b border-slate-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-teal-700">Echo · Private workspace</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Your sessions</h1>
      </header>
      <section aria-labelledby="empty-title" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 id="empty-title" className="text-2xl font-semibold text-slate-900">No sessions yet</h2>
        <p className="mt-3 max-w-xl leading-7 text-slate-600">This is the foundation for your private notes. Recording and transcription are coming in the next milestone.</p>
        <button disabled className="mt-6 rounded-lg bg-slate-100 px-5 py-3 font-medium text-slate-500 disabled:cursor-not-allowed">Recording coming soon</button>
        <p className="mt-6 text-sm text-slate-600">No audio is captured or sent to external providers by this shell.</p>
      </section>
    </main>
  );
}
