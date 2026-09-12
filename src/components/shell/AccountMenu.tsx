"use client";

import { useEffect, useId, useRef, useState } from "react";

const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "mx", "prof", "professor", "sir", "dame"]);

/** "Dr Maya Shah" -> "MS". Titles are skipped; at most two letters. */
export function initialsOf(name: string): string {
  const parts = name
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}]/gu, ""))
    .filter((p) => p && !TITLES.has(p.toLowerCase()));
  if (!parts.length) return "";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/** A round avatar button that opens a small account card. Closes on Escape or a click outside. */
export function AccountMenu({ name, organisation }: { name: string; organisation: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    function onClick(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="relative flex items-center">
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account: ${name}`}
        title={name}
        onClick={() => setOpen((o) => !o)}
        className="group flex h-11 w-11 items-center justify-center rounded-full"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[12px] font-bold leading-none text-primary-ink transition-colors group-hover:bg-primary-hover">
          {initialsOf(name)}
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="dialog"
          aria-label="Account"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-line bg-surface p-4 shadow-lg"
        >
          <p className="text-[14px] font-semibold leading-5 text-ink">{name}</p>
          <p className="text-[13px] leading-5 text-secondary">{organisation}</p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
              className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink shadow-xs hover:bg-surface-2"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
