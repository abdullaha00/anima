import type { ReactNode } from "react";

/**
 * The patient screens share the PatientStrip, but each page renders it itself with the
 * current tab, so this layout only provides the frame.
 */
export default function PatientLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}
