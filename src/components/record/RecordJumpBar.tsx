"use client";

import { useEffect, useState } from "react";

const LINKS: { hash: string; label: string }[] = [
  { hash: "#team", label: "Care team" },
  { hash: "#thread", label: "Coordination thread" },
  { hash: "#outcome", label: "Outcome" },
  { hash: "#record", label: "Record" },
];

/**
 * The compact in-page jump bar for the one record page. Plain anchors, so it works
 * without JavaScript; the current section is marked once the hash is known.
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
      <ul className="flex flex-wrap items-center gap-x-1 overflow-x-auto">
        {LINKS.map((l) => {
          const active = hash === l.hash;
          return (
            <li key={l.hash} className="flex">
              <a
                href={l.hash}
                aria-current={active ? "location" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold ${
                  active ? "border-primary text-primary" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                {l.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
