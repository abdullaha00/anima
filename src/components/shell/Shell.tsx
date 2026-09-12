import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CLINICIAN } from "@/lib/copy";
import { AccountMenu } from "./AccountMenu";
import { DataStatus } from "./DataStatus";

/**
 * The frame around every screen: a top bar on the same stone ground as the page, holding the
 * mark (the way to the worklist), the data source (only when degraded) and the signed-in
 * clinician; then the work area. The way back from a patient is the link in the patient strip.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:text-[14px] focus:font-semibold focus:text-ink focus:shadow-lg"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-line bg-ground">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-stretch gap-4 px-4 sm:gap-6 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
            <Image src="/cairn-mark.png" alt="" width={28} height={28} priority className="h-7 w-7 object-contain" />
            <span className="text-[16px] font-bold tracking-[-0.01em] text-ink">Cairn</span>
          </Link>
          <div className="ml-auto flex shrink-0 items-center gap-3 text-[12px] leading-5 text-muted">
            <DataStatus />
            <AccountMenu name={CLINICIAN.name} organisation={CLINICIAN.organisation} />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[1180px] flex-1 overflow-x-clip px-4 py-6 sm:px-8 lg:py-10">{children}</main>
    </div>
  );
}
