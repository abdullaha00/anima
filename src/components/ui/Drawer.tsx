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
          className={`mt-[0.55rem] inline-block h-2 w-2 shrink-0 border-b border-r border-primary transition-transform duration-150 ${
            open ? "rotate-45 translate-y-[-2px]" : "-rotate-45 translate-x-[-1px]"
          }`}
        />
        <span className="flex-1">{summary}</span>
      </button>
      <div id={id} className="drawer" data-open={open} aria-hidden={!open}>
        <div>
          <div className="pb-3 pl-5">{children}</div>
        </div>
      </div>
    </div>
  );
}
