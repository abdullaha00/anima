"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A tier's rows inside the worklist table. The long, low-priority tiers start folded so the
 * few people who need review this week or this month are the whole first screen; the band
 * itself is the toggle, with the count always visible.
 */
export function TierBody({
  label,
  count,
  bandClass,
  defaultOpen,
  children,
}: {
  label: ReactNode;
  count: number;
  bandClass: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <tbody>
      <tr className={`border-b border-line ${bandClass}`}>
        <td className="p-0" />
        <td colSpan={5} className="p-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((o) => !o)}
            className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 12 12"
              className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 2.5 7.5 6 4 9.5" />
            </svg>
            {label}
            <span className="text-[12px] text-faint tnum">{count}</span>
            {!open ? <span className="ml-auto text-[12px] font-medium text-secondary">Show {count}</span> : null}
          </button>
        </td>
      </tr>
      {open ? <>{children}</> : <tr id={id} hidden />}
    </tbody>
  );
}
