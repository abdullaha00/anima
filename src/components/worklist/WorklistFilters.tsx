"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TIER_ORDER } from "@/lib/domain/types";
import { Button } from "@/components/ui";
import { PLAN_GROUPS } from "@/lib/coordination/state";

export interface FilterValues {
  q: string;
  plan: string;
  tier: string;
  noPlan: string;
  group: string;
  imd: string;
  owner: string;
}

type FilterKey = Exclude<keyof FilterValues, "q">;

const FILTER_KEYS: FilterKey[] = ["plan", "tier", "noPlan", "group", "imd", "owner"];

const GROUPS = ["heart", "kidney", "respiratory", "neurological", "frailty", "cancer"];

const LABELS: Record<FilterKey, string> = {
  plan: "plan",
  tier: "tier",
  noPlan: "plan recorded",
  group: "condition",
  imd: "deprivation",
  owner: "owner",
};

const EMPTY_FILTERS: Record<FilterKey, string> = { plan: "", tier: "", noPlan: "", group: "", imd: "", owner: "" };

const SEARCH_DEBOUNCE_MS = 250;

function pick(values: FilterValues): Record<FilterKey, string> {
  return { plan: values.plan, tier: values.tier, noPlan: values.noPlan, group: values.group, imd: values.imd, owner: values.owner };
}

/**
 * Search and filters for the worklist. The URL is the source of truth so a filtered, searched
 * list can be shared and reloaded. Search applies as the clinician types (debounced); the
 * filter popout edits a local draft that is only written to the URL on Apply.
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
  const [draft, setDraft] = useState<Record<FilterKey, string>>(() => pick(values));
  const panel = useRef<HTMLDivElement>(null);
  const [pushedQ, setPushedQ] = useState(values.q);

  // If q in the URL changes from outside (back navigation, a shared link), adopt it.
  const [seenQ, setSeenQ] = useState(values.q);
  if (values.q !== seenQ) {
    setSeenQ(values.q);
    if (values.q !== pushedQ) {
      setPushedQ(values.q);
      setQ(values.q);
    }
  }

  function push(merged: FilterValues) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  // Live search: wait for a pause in typing, then write q to the URL.
  useEffect(() => {
    if (q === values.q) return;
    const t = setTimeout(() => {
      setPushedQ(q);
      push({ ...values, q });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, values]);

  /** Write a change to the applied filters, keeping whatever is in the search box. */
  function applyFilters(next: Record<FilterKey, string>) {
    push({ ...values, ...next, q });
  }

  function openPanel() {
    setDraft(pick(values));
    setOpen(true);
  }

  function closePanel() {
    setOpen(false);
  }

  // Close the popout on Escape or on a click outside it, discarding unapplied changes.
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

  const applied = FILTER_KEYS.filter((k) => values[k]);
  const draftChanged = FILTER_KEYS.some((k) => draft[k] !== values[k]);
  const selectClass = "field text-[13px]";

  function setDraftValue(k: FilterKey, v: string) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  return (
    <div className={`flex flex-col gap-3 transition-opacity duration-150 ${pending ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <form
          role="search"
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q !== values.q) {
              setPushedQ(q);
              push({ ...values, q });
            }
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
            aria-describedby="worklist-search-hint"
          />
          <span id="worklist-search-hint" className="sr-only">
            The list updates as you type.
          </span>
        </form>

        <div ref={panel} className="relative">
          <Button
            type="button"
            variant={applied.length ? "primary" : "quiet"}
            aria-expanded={open}
            aria-controls="worklist-filter-panel"
            onClick={() => (open ? closePanel() : openPanel())}
          >
            Filters{applied.length ? ` · ${applied.length}` : ""}
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
                  <select id="filter-plan" className={selectClass} value={draft.plan} onChange={(e) => setDraftValue("plan", e.target.value)}>
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
                  <select id="filter-tier" className={selectClass} value={draft.tier} onChange={(e) => setDraftValue("tier", e.target.value)}>
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
                  <select id="filter-noplan" className={selectClass} value={draft.noPlan} onChange={(e) => setDraftValue("noPlan", e.target.value)}>
                    <option value="">any</option>
                    <option value="yes">no plan recorded</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-ink">Condition group</span>
                  <select id="filter-group" className={selectClass} value={draft.group} onChange={(e) => setDraftValue("group", e.target.value)}>
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
                    <select id="filter-imd" className={selectClass} value={draft.imd} onChange={(e) => setDraftValue("imd", e.target.value)}>
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
                  <select id="filter-owner" className={selectClass} value={draft.owner} onChange={(e) => setDraftValue("owner", e.target.value)}>
                    <option value="">anyone</option>
                    {owners.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  className="min-h-11 text-[13px] font-semibold text-primary-hover hover:underline"
                  onClick={() => {
                    setDraft(EMPTY_FILTERS);
                    applyFilters(EMPTY_FILTERS);
                    closePanel();
                  }}
                >
                  Clear all
                </button>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="quiet" onClick={closePanel}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!draftChanged}
                    onClick={() => {
                      applyFilters(draft);
                      closePanel();
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {applied.length ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {applied.map((k) => (
            <button
              key={k}
              type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 font-medium text-secondary hover:border-line-strong"
              onClick={() => applyFilters({ ...pick(values), [k]: "" })}
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
