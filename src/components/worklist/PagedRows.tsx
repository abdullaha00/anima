"use client";

import { useState, type ReactNode } from "react";

const BUTTON = "min-h-11 rounded-md px-2 font-semibold text-primary-hover disabled:text-faint hover:enabled:underline";
const PAGE_LINK = "inline-flex min-h-11 min-w-9 items-center justify-center rounded-md px-1.5 font-semibold";

/** Page indices to show: all when 7 or fewer, else first, current with one neighbour each side, last. */
function pageItems(current: number, pages: number): (number | "gap")[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = new Set([0, pages - 1, current - 1, current, current + 1].filter((p) => p >= 0 && p < pages));
  const out: (number | "gap")[] = [];
  for (let i = 0; i < pages; i++) {
    if (keep.has(i)) out.push(i);
    else if (out[out.length - 1] !== "gap") out.push("gap");
  }
  return out;
}

/**
 * Previous / numbered page links / Next, with the "n–m of N" count beneath. Shared by the worklist
 * table and the patient-page lists so both page the same way.
 */
export function Pager({
  current,
  pages,
  total,
  pageSize,
  onChange,
}: {
  current: number;
  pages: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  const start = current * pageSize;
  return (
    <nav aria-label="Pagination" className="flex flex-col items-center gap-0.5 text-[12px] text-secondary tnum">
      <div className="flex w-full flex-wrap items-center justify-between gap-2">
        <button type="button" className={BUTTON} onClick={() => onChange(Math.max(0, current - 1))} disabled={current === 0}>
          Previous
        </button>
        {/* Narrow screens: the numbers take their own line above Previous / Next. */}
        <div className="order-first flex basis-full flex-wrap items-center justify-center gap-0.5 sm:order-none sm:basis-auto">
          {pageItems(current, pages).map((item, i) =>
            item === "gap" ? (
              <span key={`gap-${i}`} aria-hidden="true" className={`${PAGE_LINK} font-normal text-faint`}>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Page ${item + 1}`}
                aria-current={item === current ? "page" : undefined}
                className={`${PAGE_LINK} ${item === current ? "bg-stone-200 text-ink" : "text-primary-hover hover:underline"}`}
                onClick={() => onChange(item)}
              >
                {item + 1}
              </button>
            ),
          )}
        </div>
        <button
          type="button"
          className={BUTTON}
          onClick={() => onChange(Math.min(pages - 1, current + 1))}
          disabled={current >= pages - 1}
        >
          Next
        </button>
      </div>
      <span className="text-[11px] leading-4 text-faint">
        {start + 1}–{Math.min(total, start + pageSize)} of {total}
      </span>
    </nav>
  );
}

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
        <tr className="block px-4 py-2 md:table-row md:p-0">
          <td colSpan={colSpan} className="block p-0 md:table-cell md:px-3 md:py-1">
            <Pager current={current} pages={pages} total={rows.length} pageSize={pageSize} onChange={setPage} />
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
