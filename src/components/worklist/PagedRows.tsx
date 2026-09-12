"use client";

import { useState, type ReactNode } from "react";

const BUTTON = "min-h-9 rounded-md px-2 font-semibold text-primary-hover disabled:text-faint hover:enabled:underline";

/**
 * Table rows shown a page at a time. Receives already-rendered rows so the server keeps building
 * them; only the page index lives here. The controls sit in a final row of the same tbody so the
 * table stays valid HTML. Groups that fit on one page show no controls.
 */
export function PagedRows({ rows, pageSize = 10, colSpan }: { rows: ReactNode[]; pageSize?: number; colSpan: number }) {
  const [page, setPage] = useState(0);
  // Reset to the first page when the row count changes (a new search or filter), without an effect.
  const [seenLength, setSeenLength] = useState(rows.length);
  if (seenLength !== rows.length) {
    setSeenLength(rows.length);
    setPage(0);
  }
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;
  const slice = rows.slice(start, start + pageSize);

  return (
    <tbody>
      {slice}
      {pages > 1 ? (
        <tr>
          <td colSpan={colSpan} className="px-3 py-1">
            <div className="flex items-center justify-between text-[12px] text-secondary tnum">
              <button type="button" className={BUTTON} onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>
                Previous
              </button>
              <span>
                {start + 1}–{Math.min(rows.length, start + pageSize)} of {rows.length}
              </span>
              <button
                type="button"
                className={BUTTON}
                onClick={() => setPage(Math.min(pages - 1, current + 1))}
                disabled={current >= pages - 1}
              >
                Next
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
