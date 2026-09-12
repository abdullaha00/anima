"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Worklist", match: (p: string) => p === "/" || p.startsWith("/patient") },
  { href: "/about", label: "How Cairn works", match: (p: string) => p.startsWith("/about") },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-row gap-1 lg:flex-col">
      <span className="hidden px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint lg:block">
        Find
      </span>
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`block rounded-sm px-2 py-1.5 text-[13px] font-medium leading-5 transition-colors ${
              active ? "bg-primary-soft text-primary" : "text-secondary hover:bg-stone-100 hover:text-ink"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
