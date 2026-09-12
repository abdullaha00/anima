"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Audience, RecordFieldName } from "@/lib/domain/types";
import type { AudienceView } from "@/lib/record/record";
import { FAMILY_CONSENT_LINE, NOT_BINDING_LINE } from "@/lib/copy";
import { formatDateTime } from "@/lib/format";
import { fieldLabel } from "@/lib/record/fields";
import { Chip, ProvenanceLine } from "@/components/ui";

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

/** Four lines, large, high contrast, on the dark ground. CPR first. Nothing else. */
function AmbulanceView({ view }: { view: AudienceView }) {
  const cpr = valueOf(view, "cpr_recommendation");
  const rest: RecordFieldName[] = ["preferences_for_care", "not_recommended", "preferred_place_of_care"];
  const label = "text-[11px] font-semibold uppercase tracking-[0.06em] opacity-70";
  return (
    <div className="rounded-lg bg-ink p-8 text-[#F4EFE7]">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className={label}>CPR recommendation</span>
          <p className="text-[26px] font-bold leading-tight tracking-[-0.01em]">{cpr ?? "not recorded"}</p>
        </div>
        {rest.map((name) => {
          const v = valueOf(view, name);
          return (
            <div key={name} className="flex flex-col gap-1">
              <span className={label}>{fieldLabel(name)}</span>
              <p className="text-[20px] font-semibold leading-snug tracking-[-0.01em]">{v ?? "not recorded"}</p>
            </div>
          );
        })}
        <p className="border-t border-[#F4EFE7]/25 pt-5 text-[16px] font-medium leading-6">{NOT_BINDING_LINE}</p>
        <p className="font-mono text-[12px] opacity-80 tnum">
          signed by {view.signedBy ?? "not signed"} at {formatDateTime(view.signedAt)}
        </p>
      </div>
    </div>
  );
}

/** The clinical picture: fields in order, sans, compact. */
function OutOfHoursView({ view }: { view: AudienceView }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {view.fields.map((f) => (
        <div key={f.name} className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
          <span className="text-[13px] font-semibold leading-5 text-ink">{f.label}</span>
          <p className="text-[15px] leading-6 text-ink">{f.value}</p>
        </div>
      ))}
      {view.missing.map((name) => (
        <div key={name} className="grid gap-1 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
          <span className="text-[13px] font-semibold leading-5 text-ink">{fieldLabel(name)}</span>
          <p className="text-[15px] leading-6 text-muted">not recorded</p>
        </div>
      ))}
      <p className="pt-3 font-mono text-[12px] text-faint tnum">
        signed by {view.signedBy ?? "not signed"} at {formatDateTime(view.signedAt)}
      </p>
    </div>
  );
}

/** The whole record with provenance, for the practice, the hospice and the admitting team. */
function FullRecordView({ view, provenance }: { view: AudienceView; provenance: AudienceTabsProps["provenance"] }) {
  return (
    <div className="flex flex-col divide-y divide-line">
      {view.fields.map((f) => {
        const p = provenance[f.name];
        const serif = f.name === "what_matters" || f.name === "concerns_and_fears";
        return (
          <div key={f.name} className="flex flex-col gap-1 py-4 first:pt-0">
            <span className="text-[13px] font-semibold leading-5 text-ink">{f.label}</span>
            <p className={serif ? "prose-clinical font-voice text-[20px] leading-[1.4] text-ink" : "prose-clinical text-[15px] leading-6 text-ink"}>
              {serif ? <>&ldquo;{f.value}&rdquo;</> : f.value}
            </p>
            {p ? <ProvenanceLine recordedBy={p.recordedBy} recordedAt={p.recordedAt} source={p.source} /> : null}
          </div>
        );
      })}
      {view.missing.length ? (
        <div className="flex flex-col gap-1 py-4">
          <span className="text-[13px] font-semibold leading-5 text-ink">Not recorded</span>
          <p className="text-[15px] leading-6 text-muted">{view.missing.map(fieldLabel).join(", ")}</p>
        </div>
      ) : null}
      <p className="pt-4 font-mono text-[12px] text-faint tnum">
        signed by {view.signedBy ?? "not signed"} at {formatDateTime(view.signedAt)}
      </p>
    </div>
  );
}

/** What matters, in the voice face, at size. The place. Who is involved. No clinical recommendations. */
function FamilyView({ view }: { view: AudienceView }) {
  const whatMatters = valueOf(view, "what_matters");
  const place = valueOf(view, "preferred_place_of_care");
  const people = valueOf(view, "people_involved");
  return (
    <div className="flex flex-col gap-8 py-2 sm:px-4">
      <div className="flex flex-col gap-2">
        <span className="microlabel">What matters</span>
        {whatMatters ? (
          <p className="prose-clinical font-voice text-[22px] leading-[1.4] text-ink">&ldquo;{whatMatters}&rdquo;</p>
        ) : (
          <p className="font-voice text-[20px] text-muted">not recorded</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span className="microlabel">Preferred place of care</span>
        <p className="font-voice text-[20px] leading-[1.4] text-ink">{place ?? <span className="text-muted">not recorded</span>}</p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="microlabel">People involved</span>
        <p className="text-[15px] leading-6 text-ink">{people ?? <span className="text-muted">not recorded</span>}</p>
      </div>
      <p className="border-t border-line pt-5 text-[13px] font-medium leading-5 text-secondary">{FAMILY_CONSENT_LINE}</p>
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
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Audience views" className="-mb-px flex flex-wrap gap-x-1 overflow-x-auto border-b border-line">
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
              className={`-mb-px inline-flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[13px] font-semibold ${
                selected ? "border-primary text-primary" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {v.label}
              {sharedWith.includes(v.audience) ? (
                <Chip className="border-affirm-border bg-affirm-soft text-affirm">shared</Chip>
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
          className="flex flex-col gap-4"
        >
          <p className="text-[13px] font-medium leading-5 text-secondary">{view.description}</p>
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
