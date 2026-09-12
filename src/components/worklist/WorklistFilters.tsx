"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { WORKLIST_STATE_ORDER, TIER_ORDER } from "@/lib/domain/types";

export interface FilterValues {
  state: string;
  tier: string;
  noPlan: string;
  group: string;
  imd: string;
  owner: string;
}

const GROUPS = ["heart", "kidney", "respiratory", "neurological", "frailty", "cancer"];

/** Filters live in the URL, so a filtered worklist can be shared and reloaded. */
export function WorklistFilters({
  values,
  owners,
  imdAvailable,
}: {
  values: FilterValues;
  owners: string[];
  imdAvailable: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(next: Partial<FilterValues>) {
    const merged = { ...values, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  const selectClass =
    "min-h-11 rounded-sm border border-line bg-surface px-2.5 text-[0.875rem] text-ink focus:border-primary";

  return (
    <form
      className={`flex flex-wrap items-end gap-3 transition-opacity duration-150 ${pending ? "opacity-70" : ""}`}
      onSubmit={(e) => e.preventDefault()}
      aria-label="Filter the worklist"
    >
      <label className="flex flex-col gap-1">
        <span className="microlabel">State</span>
        <select id="filter-state" className={selectClass} value={values.state} onChange={(e) => update({ state: e.target.value })}>
          <option value="">all</option>
          {WORKLIST_STATE_ORDER.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="microlabel">Tier</span>
        <select id="filter-tier" className={selectClass} value={values.tier} onChange={(e) => update({ tier: e.target.value })}>
          <option value="">all</option>
          {Object.keys(TIER_ORDER)
            .filter((t) => t !== "no prompt")
            .map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="microlabel">Plan</span>
        <select id="filter-plan" className={selectClass} value={values.noPlan} onChange={(e) => update({ noPlan: e.target.value })}>
          <option value="">any</option>
          <option value="yes">no plan recorded</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="microlabel">Condition group</span>
        <select id="filter-group" className={selectClass} value={values.group} onChange={(e) => update({ group: e.target.value })}>
          <option value="">all</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="microlabel">Deprivation quintile</span>
        <select
          id="filter-imd"
          className={selectClass}
          value={values.imd}
          onChange={(e) => update({ imd: e.target.value })}
          disabled={!imdAvailable}
          title={imdAvailable ? undefined : "Not carried by this data source"}
        >
          <option value="">{imdAvailable ? "all" : "not in this data"}</option>
          {[1, 2, 3, 4, 5].map((q) => (
            <option key={q} value={String(q)}>
              Q{q}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="microlabel">Owner of next step</span>
        <select id="filter-owner" className={selectClass} value={values.owner} onChange={(e) => update({ owner: e.target.value })}>
          <option value="">anyone</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      {Object.values(values).some(Boolean) ? (
        <button
          type="button"
          className="min-h-11 text-[0.875rem] text-primary underline-offset-4 hover:underline"
          onClick={() => update({ state: "", tier: "", noPlan: "", group: "", imd: "", owner: "" })}
        >
          clear filters
        </button>
      ) : null}
    </form>
  );
}
