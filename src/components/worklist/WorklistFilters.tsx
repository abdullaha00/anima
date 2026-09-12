"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TIER_ORDER } from "@/lib/domain/types";
import { Button } from "@/components/ui";

export interface FilterValues {
  q: string;
  plan: string;
  tier: string;
  noPlan: string;
  group: string;
  imd: string;
  owner: string;
}

export const PLAN_GROUPS = ["no plan", "plan in progress", "plan complete"] as const;
const GROUPS = ["heart", "kidney", "respiratory", "neurological", "frailty", "cancer"];

const LABELS: Record<keyof FilterValues, string> = {
  q: "search",
  plan: "plan",
  tier: "tier",
  noPlan: "plan recorded",
  group: "condition",
  imd: "deprivation",
  owner: "owner",
};

/**
 * Search and filters for the worklist. Filters live in the URL so a filtered list can be
 * shared and reloaded; they open in a popout so the list itself stays uncluttered.
 */
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
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(values.q);
  const panel = useRef<HTMLDivElement>(null);

  function update(next: Partial<FilterValues>) {
    const merged = { ...values, q, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  // Close the popout on Escape or on a click outside it.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const active = (Object.keys(values) as (keyof FilterValues)[]).filter((k) => k !== "q" && values[k]);
  const selectClass = "field text-[13px]";

  return (
    <div className={`flex flex-col gap-3 transition-opacity duration-150 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <form
          role="search"
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q });
          }}
        >
          <label className="sr-only" htmlFor="worklist-search">
            Search patients by name or identifier
          </label>
          <input
            id="worklist-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or SIM number"
            className="field max-w-[420px]"
            autoComplete="off"
          />
          <Button type="submit" variant="quiet">
            Search
          </Button>
        </form>

        <div ref={panel} className="relative">
          <Button
            type="button"
            variant={active.length ? "primary" : "quiet"}
            aria-expanded={open}
            aria-controls="worklist-filter-panel"
            onClick={() => setOpen((o) => !o)}
          >
            Filters{active.length ? ` · ${active.length}` : ""}
          </Button>
          {open ? (
            <div
              id="worklist-filter-panel"
              role="dialog"
              aria-label="Filter the worklist"
              className="absolute right-0 z-20 mt-2 w-[min(92vw,640px)] rounded-lg border border-line bg-surface p-5 shadow-lg"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Plan</span>
                  <select id="filter-plan" className={selectClass} value={values.plan} onChange={(e) => update({ plan: e.target.value })}>
                    <option value="">all</option>
                    {PLAN_GROUPS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Review tier</span>
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
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Existing plan on the record</span>
                  <select id="filter-noplan" className={selectClass} value={values.noPlan} onChange={(e) => update({ noPlan: e.target.value })}>
                    <option value="">any</option>
                    <option value="yes">no plan recorded</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Condition group</span>
                  <select id="filter-group" className={selectClass} value={values.group} onChange={(e) => update({ group: e.target.value })}>
                    <option value="">all</option>
                    {GROUPS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Deprivation quintile</span>
                  {imdAvailable ? (
                    <select id="filter-imd" className={selectClass} value={values.imd} onChange={(e) => update({ imd: e.target.value })}>
                      <option value="">all</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={String(n)}>
                          Q{n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[13px] leading-6 text-muted">Not carried by this data source.</span>
                  )}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Owner of next action</span>
                  <select id="filter-owner" className={selectClass} value={values.owner} onChange={(e) => update({ owner: e.target.value })}>
                    <option value="">anyone</option>
                    {owners.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  className="min-h-11 text-[13px] font-semibold text-primary-hover hover:underline"
                  onClick={() => update({ plan: "", tier: "", noPlan: "", group: "", imd: "", owner: "" })}
                >
                  Clear all
                </button>
                <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {active.length || values.q ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {values.q ? (
            <button
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 font-medium text-secondary hover:border-line-strong"
              onClick={() => {
                setQ("");
                update({ q: "" });
              }}
            >
              search: {values.q} <span aria-hidden="true">×</span>
              <span className="sr-only">clear search</span>
            </button>
          ) : null}
          {active.map((k) => (
            <button
              key={k}
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 font-medium text-secondary hover:border-line-strong"
              onClick={() => update({ [k]: "" } as Partial<FilterValues>)}
            >
              {LABELS[k]}: {values[k]} <span aria-hidden="true">×</span>
              <span className="sr-only">clear {LABELS[k]} filter</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
