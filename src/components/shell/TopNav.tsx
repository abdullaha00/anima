"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Worklist", match: (p: string) => p === "/" || p.startsWith("/patient") },
  { href: "/about", label: "How Cairn works", match: (p: string) => p.startsWith("/about") },
];

/** The primary links in the top bar. The active one is green with a 2px underline. */
export function TopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex h-full items-stretch gap-1 sm:gap-2">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center border-b-2 px-2 text-[13px] font-semibold leading-5 no-underline transition-colors sm:px-3 ${
              active ? "border-primary text-primary" : "border-transparent text-secondary hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
