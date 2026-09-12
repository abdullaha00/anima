"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

/**
 * A table row that opens a patient when clicked anywhere on it. The visible name inside stays a
 * real link, so keyboard and screen-reader users reach the patient through that; the row itself
 * carries no tabindex. Clicks on links, buttons or form controls inside the row, modified clicks
 * (new tab, window) and clicks that end a text selection are left alone.
 */
export function RowLink({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function onClick(e: MouseEvent<HTMLTableRowElement>) {
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, select, textarea, label, summary")) return;
    if (window.getSelection()?.toString()) return;
    router.push(href);
  }

  return (
    <tr onClick={onClick} className={`cursor-pointer hover:bg-surface-2 focus-within:bg-surface-2 ${className}`}>
      {children}
    </tr>
  );
}
