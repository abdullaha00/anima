"use client";
export default function Error({ reset }: { reset: () => void }) { return <section className="space-y-4 p-6"><h1 className="text-2xl font-semibold">Screenings could not be loaded</h1><p>The stored results are temporarily unavailable.</p><button onClick={reset} className="rounded border px-4 py-2">Try again</button></section>; }
