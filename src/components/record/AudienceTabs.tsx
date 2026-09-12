"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Audience, RecordFieldName } from "@/lib/domain/types";
import type { AudienceView } from "@/lib/record/record";
import { FAMILY_CONSENT_LINE, NOT_BINDING_LINE } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import { fieldLabel } from "@/lib/record/fields";
import { ProvenanceLine } from "@/components/ui";

export interface Provenance {
  recordedBy: string;
  recordedAt: string;
  source: string;
}

export interface AudienceTabsProps {
  views: AudienceView[];
  /** Provenance per field, for the full-record audiences. */
  provenance: Partial<Record<RecordFieldName, Provenance>>;
  sharedWith: Audience[];
}

function valueOf(view: AudienceView, name: RecordFieldName): string | undefined {
  return view.fields.find((f) => f.name === name)?.value;
}

/** Four lines, large, high contrast, dark ground in both themes. CPR first. Nothing else. */
function AmbulanceView({ view }: { view: AudienceView }) {
  const cpr = valueOf(view, "cpr_recommendation");
  const rest: RecordFieldName[] = ["preferences_for_care", "not_recommended", "preferred_place_of_care"];
  return (
    <div className="rounded-md border border-line-strong bg-ink px-6 py-6 text-ground sm:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[0.75rem] uppercase tracking-wider opacity-70">CPR recommendation</span>
          <p className="text-[2rem] font-medium leading-tight sm:text-[2.25rem]">{cpr ?? "not recorded"}</p>
        </div>
        {rest.map((name) => {
          const v = valueOf(view, name);
          return (
            <div key={name} className="flex flex-col gap-1">
              <span className="font-mono text-[0.75rem] uppercase tracking-wider opacity-70">{fieldLabel(name)}</span>
              <p className="text-[1.5rem] font-medium leading-snug">{v ?? "not recorded"}</p>
            </div>
          );
        })}
        <p className="border-t border-line-strong pt-4 text-[1.125rem] font-medium leading-snug">{NOT_BINDING_LINE}</p>
        <p className="font-mono text-[0.875rem] opacity-80">
          signed by {view.signedBy ?? "not signed"} at {formatDateTime(view.signedAt)}
        </p>
      </div>
    </div>
  );
}

/** The clinical picture: fields in order, sans, compact. */
function OutOfHoursView({ view }: { view: AudienceView }) {
  return (
    <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
      {view.fields.map((f) => (
        <div key={f.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
          <span className="text-[0.8125rem] font-medium leading-5 text-muted">{f.label}</span>
          <p className="text-[0.9375rem] leading-6">{f.value}</p>
        </div>
      ))}
      {view.missing.map((name) => (
        <div key={name} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
          <span className="text-[0.8125rem] font-medium leading-5 text-muted">{fieldLabel(name)}</span>
          <p className="text-[0.9375rem] leading-6 text-muted italic">not recorded</p>
        </div>
      ))}
      <p className="px-4 py-3 font-mono text-[0.75rem] text-muted">
        signed by {view.signedBy ?? "not signed"} at {formatDateTime(view.signedAt)}
      </p>
    </div>
  );
}

/** The whole record with provenance, for the practice, the hospice and the admitting team. */
function FullRecordView({ view, provenance }: { view: AudienceView; provenance: AudienceTabsProps["provenance"] }) {
  return (
    <div className="flex flex-col gap-6">
      {view.fields.map((f) => {
        const p = provenance[f.name];
        const serif = f.name === "what_matters" || f.name === "concerns_and_fears";
        return (
          <div key={f.name} className="flex flex-col gap-1">
            <span className="microlabel">{f.label}</span>
            <p className={serif ? "prose-clinical font-display text-[1.125rem] leading-[1.45]" : "prose-clinical text-[0.9375rem] leading-6"}>
              {serif ? <>&ldquo;{f.value}&rdquo;</> : f.value}
            </p>
            {p ? <ProvenanceLine recordedBy={p.recordedBy} recordedAt={p.recordedAt} source={p.source} /> : null}
          </div>
        );
      })}
      {view.missing.length ? (
        <div className="flex flex-col gap-1 border-t border-line pt-4">
          <span className="microlabel">Not recorded</span>
          <p className="text-[0.9375rem] leading-6 text-muted italic">{view.missing.map(fieldLabel).join(", ")}</p>
        </div>
      ) : null}
      <p className="font-mono text-[0.75rem] text-muted">
        signed by {view.signedBy ?? "not signed"} at {formatDateTime(view.signedAt)}
      </p>
    </div>
  );
}

/** What matters, in the serif, at size. The place. Who is involved. No clinical recommendations. */
function FamilyView({ view }: { view: AudienceView }) {
  const whatMatters = valueOf(view, "what_matters");
  const place = valueOf(view, "preferred_place_of_care");
  const people = valueOf(view, "people_involved");
  return (
    <div className="flex flex-col gap-8 rounded-md border border-line bg-surface px-6 py-8 sm:px-10">
      <div className="flex flex-col gap-2">
        <span className="microlabel">What matters</span>
        {whatMatters ? (
          <p className="prose-clinical font-voice text-[1.5rem] leading-[1.4] text-ink">&ldquo;{whatMatters}&rdquo;</p>
        ) : (
          <p className="font-voice text-[1.25rem] text-muted">not recorded</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="microlabel">Preferred place of care</span>
        <p className="font-voice text-[1.25rem] leading-[1.4]">{place ?? <span className="text-muted italic">not recorded</span>}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="microlabel">People involved</span>
        <p className="text-[1rem] leading-6">{people ?? <span className="text-muted italic">not recorded</span>}</p>
      </div>
      <p className="border-t border-line pt-4 text-[0.9375rem] leading-6 text-muted">{FAMILY_CONSENT_LINE}</p>
    </div>
  );
}

/**
 * One tab per audience, each a genuinely different document from the same record.
 * Keyboard reachable: arrow keys move between tabs, Enter or Space selects, Home and End
 * jump. Rendered only once a clinician has signed.
 */
export function AudienceTabs({ views, provenance, sharedWith }: AudienceTabsProps) {
  const [index, setIndex] = useState(0);
  const [focused, setFocused] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  function focusTab(i: number) {
    const n = views.length;
    const next = ((i % n) + n) % n;
    setFocused(next);
    refs.current[next]?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusTab(i + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusTab(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(views.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        setIndex(i);
        break;
    }
  }

  const view = views[index];

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Audience views" className="-mb-px flex flex-wrap gap-x-1 border-b border-line">
        {views.map((v, i) => {
          const selected = i === index;
          return (
            <button
              key={v.audience}
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${baseId}-tab-${v.audience}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${v.audience}`}
              tabIndex={i === focused ? 0 : -1}
              onClick={() => {
                setIndex(i);
                setFocused(i);
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-[0.9375rem] ${
                selected ? "border-primary font-medium text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {v.label}
              {sharedWith.includes(v.audience) ? (
                <span className="font-mono text-[0.6875rem] text-affirm">shared</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {view ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${view.audience}`}
          aria-labelledby={`${baseId}-tab-${view.audience}`}
          tabIndex={0}
          className="flex flex-col gap-3"
        >
          <p className="text-[0.8125rem] leading-5 text-muted">{view.description}</p>
          {view.audience === "ambulance" ? (
            <AmbulanceView view={view} />
          ) : view.audience === "out_of_hours" ? (
            <OutOfHoursView view={view} />
          ) : view.audience === "family" ? (
            <FamilyView view={view} />
          ) : (
            <FullRecordView view={view} provenance={provenance} />
          )}
        </div>
      ) : null}
    </div>
  );
}
