"use client";

import { Chip, type ChipTone } from "@/components/ui";
import { Pager } from "@/components/worklist/PagedRows";

import { useState } from "react";

export interface PagedItem {
  key: string;
  /** Left column, e.g. a date */
  meta?: string;
  primary: string;
  secondary?: string;
  detail?: string;
  /** A short category, shown as a chip: appointment, ED attendance, task. */
  tag?: string;
  tone?: ChipTone;
}

/** A short list shown five at a time, with previous, numbered page and next controls. */
export function PagedList({ items, pageSize = 5, empty }: { items: PagedItem[]; pageSize?: number; empty: string }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const slice = items.slice(page * pageSize, page * pageSize + pageSize);

  if (!items.length) return <p className="text-[14px] leading-6 text-muted">{empty}</p>;

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col divide-y divide-line">
        {slice.map((it) => (
          <li key={it.key} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 py-3 text-[13px] leading-5 first:pt-0">
            <span className="break-words font-mono text-[12px] leading-5 text-faint tnum">{it.meta ?? ""}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="break-words text-[14px] font-semibold leading-5 text-ink">{it.primary}</span>
              {it.tag || it.secondary ? (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {it.tag ? <Chip tone={it.tone ?? "neutral"}>{it.tag}</Chip> : null}
                  {it.secondary ? <span className="text-[12px] leading-5 text-secondary">{it.secondary}</span> : null}
                </span>
              ) : null}
              {it.detail ? <span className="text-[13px] leading-5 text-secondary">{it.detail}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      {pages > 1 ? (
        <div className="border-t border-line pt-3">
          <Pager current={page} pages={pages} total={items.length} pageSize={pageSize} onChange={setPage} />
        </div>
      ) : null}
    </div>
  );
}
