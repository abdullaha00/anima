"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * The evidence drawer. Content is already in the DOM and is revealed: no network call,
 * no spinner. Height and opacity animate together over 150ms; prefers-reduced-motion
 * makes it instant (see globals.css). Keyboard reachable: the summary is a real button.
 */
export function Drawer({
  summary,
  children,
  defaultOpen = false,
  className = "",
  summaryClassName = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  summaryClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`group flex w-full items-start gap-3 text-left min-h-11 py-2 ${summaryClassName}`}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-primary group-hover:bg-primary-soft"
        >
          <svg
            viewBox="0 0 16 16"
            className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </span>
        <span className="flex-1">{summary}</span>
      </button>
      <div id={id} className="drawer" data-open={open} inert={!open}>
        <div>
          <div className="pb-3 pl-9">{children}</div>
        </div>
      </div>
    </div>
  );
}
