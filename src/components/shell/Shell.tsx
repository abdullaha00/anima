import Link from "next/link";
import type { ReactNode } from "react";
import { CLINICIAN } from "@/lib/copy";
import { DataStatus } from "./DataStatus";

/** The frame around every screen. Quiet header, the clinician's identity, the data source. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-baseline gap-3 no-underline">
            <span className="font-serif text-[1.375rem] font-medium leading-none tracking-tight text-ink">Cairn</span>
            <span className="hidden text-[0.8125rem] text-muted sm:inline">
              advance care planning, coordinated
            </span>
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-4 text-[0.875rem]">
            <Link href="/" className="text-ink hover:text-primary">
              Worklist
            </Link>
            <Link href="/about" className="text-muted hover:text-primary">
              How Cairn works
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-4 text-[0.8125rem] text-muted">
            <DataStatus />
            <span>
              <span className="text-ink">{CLINICIAN.name}</span>, {CLINICIAN.organisation}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-[1280px] px-4 py-4 text-[0.75rem] leading-5 text-muted sm:px-6">
          Cairn reports indicators present in the record as a prompt for clinical review. It makes no prediction about any patient,
          cannot sign a record, and shares nothing until a named clinician
          signs. Synthetic data from NHS-SIM. Participant replies are simulated.
        </div>
      </footer>
    </div>
  );
}
