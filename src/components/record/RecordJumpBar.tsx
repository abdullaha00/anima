"use client";

import { useEffect, useState } from "react";

const LINKS: { hash: string; label: string; short?: string }[] = [
  { hash: "#team", label: "Care team" },
  { hash: "#details", label: "Personal details", short: "Details" },
  { hash: "#matters", label: "What matters" },
  { hash: "#clinical", label: "Clinical context", short: "Clinical" },
  { hash: "#emergency", label: "Emergency care", short: "Emergency" },
  { hash: "#sign", label: "Signatures" },
];

/**
 * The compact in-page jump bar for the one record page. Plain anchors, so it works
 * without JavaScript; the current section is marked once the hash is known. At phone
 * width the row scrolls sideways rather than wrapping, and the longest label shortens.
 */
export function RecordJumpBar() {
  const [hash, setHash] = useState("");
  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  return (
    <nav
      aria-label="Sections of the record"
      className="sticky top-14 z-10 -mx-4 mb-8 border-b border-line bg-ground/95 px-4 backdrop-blur-sm sm:-mx-8 sm:px-8"
    >
      <ul className="flex flex-nowrap items-center gap-x-1 overflow-x-auto scroll-px-3 pb-px">
        {LINKS.map((l) => {
          const active = hash === l.hash;
          return (
            <li key={l.hash} className="flex shrink-0">
              <a
                href={l.hash}
                aria-current={active ? "location" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold ${
                  active ? "border-primary text-primary" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {l.short ? (
                  <>
                    <span className="sm:hidden">{l.short}</span>
                    <span className="hidden sm:inline">{l.label}</span>
                  </>
                ) : (
                  l.label
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
