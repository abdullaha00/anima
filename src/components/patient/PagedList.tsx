"use client";

import { useState } from "react";

export interface PagedItem {
  key: string;
  /** Left column, e.g. a date */
  meta?: string;
  primary: string;
  secondary?: string;
  detail?: string;
}

/** A short list shown five at a time, with plain previous and next controls. */
export function PagedList({ items, pageSize = 5, empty }: { items: PagedItem[]; pageSize?: number; empty: string }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const slice = items.slice(page * pageSize, page * pageSize + pageSize);

  if (!items.length) return <p className="text-[14px] leading-6 text-muted">{empty}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y divide-line">
        {slice.map((it) => (
          <li key={it.key} className="grid grid-cols-[5.75rem_1fr] gap-3 py-2.5 text-[13px] leading-5 first:pt-0">
            <span className="text-[12px] text-faint tnum">{it.meta ?? ""}</span>
            <span className="min-w-0">
              <span className="font-medium text-ink">{it.primary}</span>
              {it.secondary ? <span className="text-faint"> · {it.secondary}</span> : null}
              {it.detail ? <span className="block text-[12px] leading-5 text-secondary">{it.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-line pt-3 text-[12px] text-secondary tnum">
          <button
            type="button"
            className="min-h-9 rounded-md px-2 font-semibold text-primary-hover disabled:text-faint hover:enabled:underline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </button>
          <span>
            {page * pageSize + 1}–{Math.min(items.length, (page + 1) * pageSize)} of {items.length}
          </span>
          <button
            type="button"
            className="min-h-9 rounded-md px-2 font-semibold text-primary-hover disabled:text-faint hover:enabled:underline"
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
