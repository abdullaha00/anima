import Link from "next/link";
import type { ReviewTier, WorklistRow, WorklistState } from "@/lib/domain/types";
import { TIER_ORDER, WORKLIST_STATE_ORDER } from "@/lib/domain/types";
import { getPatients } from "@/lib/data/source";
import { getEngine } from "@/lib/scoring";
import { sweep } from "@/lib/scoring/sweep";
import { casesById } from "@/lib/store";
import { formatAge, formatDate, formatDateTime, plural } from "@/lib/format";
import { COMPARATOR_LINE } from "@/lib/copy";
import { Microlabel, Mono, Notice, Panel, StateBadge, TierLabel } from "@/components/ui";
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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="font-serif text-[1.75rem] font-medium leading-tight tracking-tight">Worklist</h1>
          <p className="mt-1 text-[0.9375rem] text-muted">
            Every patient with indicators present in the record, with where their plan has got to.
          </p>
        </div>
        <p className="font-mono text-[0.75rem] text-muted">
          {mode === "snapshot" || degraded ? "snapshot" : "live"} · simulation clock {formatDate(nowIso)} · taken{" "}
          {formatDateTime(meta.takenAt)}
        </p>
      </header>

      {/* Summary strip: real figures, quiet treatment, hairlines rather than cards. */}
      <dl className="grid grid-cols-2 gap-y-4 border-y border-line py-4 sm:grid-cols-5">
        {[
          ["patients scanned", f.patientsScanned],
          ["carry indicators", f.indicatorsPresent],
          ["no register entry or plan", f.notOnRegisterOrPlan],
          ["prompted for review", f.promptedForReview],
          ["waiting on somebody", f.waitingOnSomeone],
        ].map(([label, value], i) => (
          <div key={label} className={`flex flex-col gap-1 px-4 ${i > 0 ? "sm:border-l sm:border-line" : ""}`}>
            <dt className="microlabel">{label}</dt>
            <dd className="font-serif text-[1.75rem] leading-none tnum">{value.toLocaleString("en-GB")}</dd>
          </div>
        ))}
      </dl>

      {result.modelDisclosure ? <Notice kind="quiet">{result.modelDisclosure}</Notice> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <WorklistFilters values={filters} owners={owners} imdAvailable={e.imdAvailable} />

          {groups.length === 0 ? (
            <Notice kind="quiet">No patients match these filters.</Notice>
          ) : (
            groups.map((g) => (
              <section key={g.state} aria-labelledby={`state-${g.state}`}>
                <div className="flex items-baseline gap-3 pb-2">
                  <h2 id={`state-${g.state}`} className="font-serif text-[1.125rem] font-medium">
                    <StateBadge state={g.state} />
                  </h2>
                  <span className="text-[0.8125rem] text-muted tnum">
                    {plural(
                      g.tiers.reduce((n, t) => n + t.rows.length, 0),
                      "patient",
                    )}
                  </span>
                </div>
                <div className="overflow-x-auto border border-line bg-surface rounded-sm">
                  <table className="w-full min-w-[720px] text-[0.9375rem]">
                    <thead className="text-left">
                      <tr className="border-b border-line">
                        <th className="microlabel px-3 py-2 font-medium">Patient</th>
                        <th className="microlabel px-3 py-2 font-medium tnum">Age</th>
                        <th className="microlabel px-3 py-2 font-medium">Conditions</th>
                        <th className="microlabel px-3 py-2 font-medium">Indicators</th>
                        <th className="microlabel px-3 py-2 font-medium">Waiting on</th>
                      </tr>
                    </thead>
                    {g.tiers.map((t) => (
                      <tbody key={t.tier}>
                        <tr className="border-b border-line bg-surface-2/60">
                          <td colSpan={5} className="px-3 py-1.5">
                            <TierLabel tier={t.tier} className="text-[0.8125rem]" />
                            <span className="ml-2 text-[0.8125rem] text-muted tnum">{t.rows.length}</span>
                          </td>
                        </tr>
                        {t.rows.map((r) => (
                          <tr key={r.patientId} className="border-b border-line last:border-b-0 hover:bg-surface-2/40">
                            <td className="px-3 py-2.5">
                              <Link href={`/patient/${r.patientId}`} className="font-medium text-ink hover:text-primary">
                                {r.name ?? r.patientId}
                              </Link>
                              <div>
                                <Mono className="text-muted">{r.patientId}</Mono>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 tnum text-muted">{formatAge(r.age)}</td>
                            <td className="px-3 py-2.5 text-muted">
                              {r.conditions.length ? r.conditions.join(", ") : "none coded"}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-medium tnum">{r.assessment.signals.length}</span>
                              <span className="text-muted"> · {r.assessment.signals.map((s) => s.label).join("; ")}</span>
                            </td>
                            <td className="px-3 py-2.5">
                              {r.state === "paused" && r.pausedReason ? (
                                <span className="text-muted">paused: {r.pausedReason}</span>
                              ) : r.waitingOn ? (
                                <span>
                                  <span className="text-ink">{r.waitingOn.ownerName}</span>
                                  <span className="text-muted">
                                    , {r.waitingOn.ownerRole} · {r.waitingOn.what} · due {formatDate(r.waitingOn.due)}
                                    {r.waitingOn.status === "blocked" ? " · blocked" : ""}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted">no open next step</span>
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

        <aside className="flex flex-col gap-4">
          <Panel title="Cohort composition" aside="descriptive">
            <dl className="flex flex-col gap-3 text-[0.9375rem]">
              <div>
                <dt className="microlabel">non-cancer share of the identified cohort</dt>
                <dd className="font-serif text-[1.5rem] leading-tight tnum">{pct(e.cohortNonCancerShare)}</dd>
              </div>
              <div>
                <dt className="microlabel">non-cancer share, newly identified</dt>
                <dd className="font-serif text-[1.5rem] leading-tight tnum">{pct(e.newlyIdentifiedNonCancerShare)}</dd>
              </div>
              <div>
                <dt className="microlabel">flag rate by deprivation quintile</dt>
                <dd className="text-muted">
                  {e.imdAvailable ? (
                    <ul className="tnum">
                      {Object.entries(e.flagRateByImdQuintile).map(([q, rate]) => (
                        <li key={q}>
                          Q{q}: {Math.round(rate * 1000) / 10}%
                        </li>
                      ))}
                    </ul>
                  ) : (
                    "Deprivation quintile is not carried by this data source."
                  )}
                </dd>
              </div>
            </dl>
            <p className="prose-clinical mt-4 text-[0.8125rem] leading-5 text-muted">{COMPARATOR_LINE}</p>
            <p className="prose-clinical mt-2 text-[0.8125rem] leading-5 text-muted">
              The simulator population carries no cancer diagnoses, so the cancer comparison cannot be made here.{" "}
              {e.note}
            </p>
          </Panel>

          <Panel title="By tier">
            <dl className="flex flex-col gap-1 text-[0.9375rem]">
              {(Object.keys(TIER_ORDER) as ReviewTier[]).map((t) => (
                <div key={t} className="flex justify-between gap-3">
                  <dt>
                    <TierLabel tier={t} />
                  </dt>
                  <dd className="tnum text-muted">{result.byTier[t] ?? 0}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          {result.inertIndicators.length ? (
            <Panel title="No data, not no indicator">
              <p className="mb-2 text-[0.8125rem] leading-5 text-muted">
                These catalogue indicators cannot fire because the data source does not carry the field they read.
              </p>
              <ul className="flex flex-col gap-1 text-[0.8125rem] leading-5">
                {result.inertIndicators.map((i) => (
                  <li key={i.id}>
                    <Mono className="text-muted">{i.id}</Mono> {i.label}{" "}
                    <span className="text-muted">(needs {i.missingField})</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <div className="px-1 text-[0.8125rem] leading-5 text-muted">
            <Microlabel className="mb-1">Engine</Microlabel>
            <Mono>{result.engineId}</Mono>. Indicators and tiers come from the rules. A model, when present, may only
            reorder within a tier and is labelled.
          </div>
        </aside>
      </div>
    </div>
  );
}
