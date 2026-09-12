import Image from "next/image";
import type { ReactNode } from "react";
import { CLINICIAN } from "@/lib/copy";
import { DataStatus } from "./DataStatus";
import { SidebarNav } from "./SidebarNav";

/**
 * The frame around every screen: a 220px sidebar with the mark, the navigation, the data
 * source and the signed-in clinician; the work area on the stone ground. On narrow
 * screens the sidebar becomes a top bar.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="flex shrink-0 flex-row flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-3 lg:sticky lg:top-0 lg:h-screen lg:w-[220px] lg:flex-col lg:items-stretch lg:gap-8 lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
        <a href="/" className="flex items-center gap-2.5 no-underline">
          <Image src="/cairn-mark.png" alt="" width={32} height={32} priority className="h-8 w-8 object-contain" />
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-bold tracking-[-0.01em] text-ink">Cairn</span>
            <span className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
              advance care planning
            </span>
          </span>
        </a>
        <SidebarNav />
        <div className="ml-auto flex flex-col gap-2 text-[12px] leading-5 text-muted lg:ml-0 lg:mt-auto lg:border-t lg:border-line lg:pt-4">
          <DataStatus />
          <span>
            <span className="font-medium text-secondary">{CLINICIAN.name}</span>
            <br />
            {CLINICIAN.organisation}
          </span>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-8 lg:px-12 lg:py-10">{children}</main>
        <footer className="mx-auto w-full max-w-[1180px] px-4 pb-8 text-[12px] leading-5 text-faint sm:px-8 lg:px-12">
          Cairn reports indicators present in the record as a prompt for clinical review. It makes no prediction about any patient,
          cannot sign a record, and shares nothing until a named clinician signs. Synthetic data from NHS-SIM. Participant
          replies are simulated.
        </footer>
      </div>
    </div>
  );
}
