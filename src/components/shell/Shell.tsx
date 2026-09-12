import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CLINICIAN } from "@/lib/copy";
import { AccountMenu } from "./AccountMenu";
import { DataStatus } from "./DataStatus";
import { TopNav } from "./TopNav";

/**
 * The frame around every screen: a white top bar with the mark, the primary links, the data
 * source (only when degraded) and the signed-in clinician; the work area on the stone ground.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[1180px] items-stretch gap-4 px-4 sm:gap-6 sm:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5 no-underline">
            <Image src="/cairn-mark.png" alt="" width={28} height={28} priority className="h-7 w-7 object-contain" />
            <span className="text-[16px] font-bold tracking-[-0.01em] text-ink">Cairn</span>
          </Link>
          <TopNav />
          <div className="ml-auto flex shrink-0 items-center gap-3 text-[12px] leading-5 text-muted">
            <DataStatus />
            <AccountMenu name={CLINICIAN.name} organisation={CLINICIAN.organisation} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1180px] flex-1 overflow-x-clip px-4 py-6 sm:px-8 lg:py-10">{children}</main>
      <footer className="mx-auto w-full max-w-[1180px] px-4 pb-8 text-[12px] leading-5 text-faint sm:px-8">
        Cairn reports indicators present in the record as a prompt for clinical review. It makes no prediction about any patient,
        cannot sign a record, and shares nothing until a named clinician signs. Synthetic data from NHS-SIM. Participant
        replies are simulated.
      </footer>
    </div>
  );
}
