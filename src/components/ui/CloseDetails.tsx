"use client";

/** A quiet link at the foot of a long disclosure that closes it and scrolls its summary back into view. */
export function CloseDetails({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-semibold text-primary-hover hover:underline"
      onClick={(e) => {
        const details = e.currentTarget.closest("details");
        if (!details) return;
        details.removeAttribute("open");
        details.querySelector("summary")?.scrollIntoView({ block: "nearest" });
      }}
    >
      <svg aria-hidden="true" viewBox="0 0 12 12" className="h-3 w-3 shrink-0 -rotate-90" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 2.5 7.5 6 4 9.5" />
      </svg>
      {label}
    </button>
  );
}
