import Link from "next/link";
import type { ReviewTier, WorklistRow, WorklistState } from "@/lib/domain/types";
import { TIER_ORDER, WORKLIST_STATE_ORDER } from "@/lib/domain/types";
import { getPatients } from "@/lib/data/source";
import { getEngine } from "@/lib/scoring";
import { sweep } from "@/lib/scoring/sweep";
import { casesById } from "@/lib/store";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { COMPARATOR_LINE } from "@/lib/copy";
import { Chip, Mono, Notice, PageHeader, Panel, StateBadge, TierLabel } from "@/components/ui";
import { WorklistFilters, type FilterValues } from "@/components/worklist/WorklistFilters";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const CONDITION_GROUPS: Record<string, RegExp> = {
  heart: /heart failure/i,
  kidney: /ckd|kidney|renal/i,
  respiratory: /copd|pulmonary|lung/i,
  neurological: /parkinson|dementia|motor neurone|multiple sclerosis/i,
  frailty: /frailty/i,
  cancer: /cancer|carcinoma|metastatic|lymphoma|leukaemia|myeloma/i,
};

/** The left-edge stripe encodes progress, never urgency: amber in progress, green complete. */
const STRIPE: Record<WorklistState, string> = {
  flagged: "bg-transparent",
  "team assembled": "bg-warn-stripe",
  coordinating: "bg-warn-stripe",
  "meeting held": "bg-warn-stripe",
  "record signed": "bg-cairn-400",
  shared: "bg-cairn-400",
  paused: "bg-stone-300",
};

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function applyFilters(rows: WorklistRow[], f: FilterValues): WorklistRow[] {
  return rows.filter((r) => {
    if (f.state && r.state !== f.state) return false;
    if (f.tier && r.assessment.tier !== f.tier) return false;
    if (f.noPlan === "yes" && (r.assessment.hasPlan || r.assessment.alreadyOnRegister)) return false;
    if (f.group && !r.conditions.some((c) => CONDITION_GROUPS[f.group]?.test(c))) return false;
    if (f.imd && String(r.imdQuintile ?? "") !== f.imd) return false;
    if (f.owner && r.waitingOn?.ownerName !== f.owner) return false;
    return true;
  });
}

function groupRows(rows: WorklistRow[]): { state: WorklistState; tiers: { tier: ReviewTier; rows: WorklistRow[] }[] }[] {
  const out: { state: WorklistState; tiers: { tier: ReviewTier; rows: WorklistRow[] }[] }[] = [];
  for (const state of WORKLIST_STATE_ORDER) {
    const inState = rows.filter((r) => r.state === state);
    if (!inState.length) continue;
    const tiers = (Object.keys(TIER_ORDER) as ReviewTier[])
      .map((tier) => ({ tier, rows: inState.filter((r) => r.assessment.tier === tier) }))
      .filter((t) => t.rows.length);
    out.push({ state, tiers });
  }
  return out;
}

export default async function WorklistPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters: FilterValues = {
    state: one(sp.state),
    tier: one(sp.tier),
    noPlan: one(sp.noPlan),
    group: one(sp.group),
    imd: one(sp.imd),
    owner: one(sp.owner),
  };

  const [{ patients, meta, mode, degraded }, cases] = await Promise.all([getPatients(), casesById()]);
  const engine = getEngine();
  const nowIso = meta.simulationNow;
  const assessments = await engine.assessMany(patients, { nowIso });
  const result = sweep(patients, assessments, cases, nowIso);

  const rows = applyFilters(result.rows, filters);
  const groups = groupRows(rows);
  const owners = Array.from(new Set(result.rows.map((r) => r.waitingOn?.ownerName).filter((x): x is string => !!x))).sort();
  const f = result.funnel;
  const e = result.equity;
  const pct = (x: number | null) => (x === null ? "not available" : `${Math.round(x * 100)}%`);

  const summary: [string, number][] = [
    ["patients scanned", f.patientsScanned],
    ["carry indicators", f.indicatorsPresent],
    ["no register entry or plan", f.notOnRegisterOrPlan],
    ["prompted for review", f.promptedForReview],
    ["waiting on somebody", f.waitingOnSomeone],
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Case finding"
        title="Worklist"
        intro="Every patient with indicators present in the record, and where their plan has got to. The last column shows the next action and who owns it."
        aside={
          <span className="tnum">
            {mode === "snapshot" || degraded ? "Snapshot" : "Live"} · simulation clock {formatDate(nowIso)} · taken{" "}
            {formatDateTime(meta.takenAt)}
          </span>
        }
      />

      {/* Summary strip: real figures from the sweep, one white bar with hairline dividers. */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-line bg-surface shadow-sm sm:grid-cols-5">
        {summary.map(([label, value], i) => (
          <div
            key={label}
            className={`flex flex-col gap-1 px-5 py-4 ${i > 0 ? "border-l border-line" : ""} ${i >= 2 ? "border-t border-line sm:border-t-0" : ""}`}
          >
            <dd className={`font-display text-[22px] leading-none tnum ${i === 1 || i === 4 ? "text-primary" : "text-ink"}`}>
              {value.toLocaleString("en-GB")}
            </dd>
            <dt className="microlabel mt-1">{label}</dt>
          </div>
        ))}
      </dl>

      {result.modelDisclosure ? <Notice kind="info">{result.modelDisclosure}</Notice> : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          <WorklistFilters values={filters} owners={owners} imdAvailable={e.imdAvailable} />

          {groups.length === 0 ? (
            <Notice kind="quiet">No patients match these filters.</Notice>
          ) : (
            groups.map((g) => (
              <section key={g.state} aria-labelledby={`state-${g.state}`} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <h2 id={`state-${g.state}`}>
                    <StateBadge state={g.state} />
                  </h2>
                  <span className="text-[13px] font-medium text-secondary tnum">
                    {plural(
                      g.tiers.reduce((n, t) => n + t.rows.length, 0),
                      "patient",
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
                  <table className="w-full min-w-[720px] table-fixed text-[13px]">
                    <thead className="text-left">
                      <tr className="border-b-2 border-line">
                        <th className="w-1 p-0" aria-hidden="true" />
                        <th className="microlabel w-[19%] px-3 py-2.5">Patient</th>
                        <th className="microlabel w-[6%] px-2 py-2.5 tnum">Age</th>
                        <th className="microlabel w-[17%] px-3 py-2.5">Conditions</th>
                        <th className="microlabel w-[33%] px-3 py-2.5">Indicators present</th>
                        <th className="microlabel px-3 py-2.5">Next action · owner</th>
                      </tr>
                    </thead>
                    {g.tiers.map((t) => (
                      <tbody key={t.tier}>
                        <tr className="border-b border-line bg-surface-2">
                          <td className="p-0" />
                          <td colSpan={5} className="px-3 py-1.5">
                            <TierLabel tier={t.tier} />
                            <span className="ml-2 text-[12px] text-faint tnum">{t.rows.length}</span>
                          </td>
                        </tr>
                        {t.rows.map((r) => (
                          <tr key={r.patientId} className="border-b border-line last:border-b-0 hover:bg-surface-2">
                            <td className="p-0">
                              <span aria-hidden="true" className={`block h-full min-h-[3.25rem] w-1 ${STRIPE[r.state]}`} />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <Link href={`/patient/${r.patientId}`} className="text-[15px] font-bold tracking-[-0.01em] text-ink hover:text-primary">
                                {r.name ?? r.patientId}
                              </Link>
                              <div className="mt-0.5">
                                <Mono className="text-faint">{r.patientId}</Mono>
                              </div>
                            </td>
                            <td className="px-2 py-3 align-top text-secondary tnum">{r.age !== undefined ? r.age : "—"}</td>
                            <td className="px-3 py-3 align-top">
                              <div className="flex flex-wrap gap-1">
                                {r.conditions.length ? (
                                  r.conditions.map((c) => <Chip key={c}>{c}</Chip>)
                                ) : (
                                  <span className="text-muted">none coded</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top">
                              <span className="font-semibold text-ink tnum">{plural(r.assessment.signals.length, "indicator")}</span>
                              <span className="text-secondary">: {r.assessment.signals.map((s) => s.label).join("; ")}</span>
                            </td>
                            <td className="px-3 py-3 align-top">
                              {r.state === "paused" && r.pausedReason ? (
                                <span className="text-secondary">paused: {r.pausedReason}</span>
                              ) : r.waitingOn ? (
                                <span>
                                  <span className="font-semibold text-ink">{r.waitingOn.ownerName}</span>
                                  <span className="text-secondary">
                                    , {r.waitingOn.ownerRole}
                                    <br />
                                    {r.waitingOn.what} · due {formatDate(r.waitingOn.due)}
                                    {r.waitingOn.status === "blocked" ? " · blocked" : ""}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted">no action recorded</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    ))}
                  </table>
                </div>
              </section>
            ))
          )}
        </div>

        <aside className="flex flex-col gap-5">
          <Panel title="Cohort composition" aside="descriptive" tone="brand">
            <dl className="flex flex-col gap-4">
              <div>
                <dd className="font-display text-[22px] leading-none text-ink tnum">{pct(e.cohortNonCancerShare)}</dd>
                <dt className="microlabel mt-1.5">non-cancer share of the identified cohort</dt>
              </div>
              <div>
                <dd className="font-display text-[22px] leading-none text-ink tnum">{pct(e.newlyIdentifiedNonCancerShare)}</dd>
                <dt className="microlabel mt-1.5">non-cancer share, newly identified</dt>
              </div>
              <div>
                <dt className="microlabel">flag rate by deprivation quintile</dt>
                <dd className="mt-1 text-[13px] text-secondary">
                  {e.imdAvailable ? (
                    <ul className="tnum">
                      {Object.entries(e.flagRateByImdQuintile).map(([q, rate]) => (
                        <li key={q}>
                          Q{q}: {Math.round(rate * 1000) / 10}%
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Not carried by this data source."
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-line pt-3 text-[12px] leading-5 text-muted">{COMPARATOR_LINE}</p>
            <p className="mt-2 text-[12px] leading-5 text-muted">
              The simulator population carries no cancer diagnoses, so the cancer comparison cannot be made here. {e.note}
            </p>
          </Panel>

          <Panel title="By tier">
            <dl className="flex flex-col gap-1.5">
              {(Object.keys(TIER_ORDER) as ReviewTier[]).map((t) => (
                <div key={t} className="flex justify-between gap-3">
                  <dt>
                    <TierLabel tier={t} />
                  </dt>
                  <dd className="text-[13px] font-medium text-secondary tnum">{result.byTier[t] ?? 0}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {result.inertIndicators.length ? (
            <Panel title="No data, not no indicator">
              <p className="mb-3 text-[12px] leading-5 text-muted">
                These catalogue indicators cannot fire because the data source does not carry the field they read.
              </p>
              <ul className="flex flex-col gap-1.5 text-[12px] leading-5">
                {result.inertIndicators.map((i) => (
                  <li key={i.id}>
                    <Mono className="text-faint">{i.id}</Mono> <span className="text-secondary">{i.label}</span>{" "}
                    <span className="text-faint">(needs {i.missingField})</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <p className="px-1 text-[12px] leading-5 text-faint">
            Engine <Mono>{result.engineId}</Mono>. Indicators and tiers come from the rules. A model, when present, may
            only reorder within a tier and is labelled.
          </p>
        </aside>
      </div>
    </div>
  );
}
