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
          className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-surface py-4 pl-4 pr-12 shadow-lg"
        >
          <p className="break-words text-[14px] font-semibold leading-5 text-ink">{name}</p>
          <p className="break-words text-[13px] leading-5 text-secondary">{organisation}</p>
          {/* A small round close in the corner: the card is two lines of text and needs no button row. */}
          <button
            type="button"
            autoFocus
            aria-label="Close"
            onClick={() => {
              setOpen(false);
              button.current?.focus();
            }}
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-stone-100 hover:text-ink"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 14 14"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
