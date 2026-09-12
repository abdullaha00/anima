"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

export interface ExamplePatientOption {
  id: string;
  name: string;
}

/**
 * A native select in the top bar that opens one of the example patients from the synthetic
 * cohort. Styled like the quiet button so it sits beside the account menu without competing
 * with it. Choosing an option navigates; the select then returns to its placeholder, so the
 * same patient can be chosen again from another page.
 */
export function ExamplePatients({ patients }: { patients: ExamplePatientOption[] }) {
  const router = useRouter();
  if (patients.length === 0) return null;

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const id = event.currentTarget.value;
    if (!id) return;
    event.currentTarget.value = "";
    router.push(`/patient/${encodeURIComponent(id)}`);
  }

  return (
    <select
      aria-label="Open an example patient from the synthetic cohort"
      defaultValue=""
      onChange={onChange}
      className="h-11 max-w-[min(52vw,260px)] cursor-pointer rounded-md border border-line-strong bg-surface pl-3 pr-8 text-[13px] font-semibold leading-none text-ink shadow-xs transition-colors duration-150 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <option value="">Example patients</option>
      <optgroup label="Synthetic cohort, 30-day cutoff">
        {patients.map((patient) => (
          <option key={patient.id} value={patient.id}>
            {patient.name} · {patient.id}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
