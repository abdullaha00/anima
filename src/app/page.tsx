import Link from "next/link";
import type { ReviewTier, WorklistRow } from "@/lib/domain/types";
import { TIER_ORDER } from "@/lib/domain/types";
import { getPatients } from "@/lib/data/source";
import { getEngine } from "@/lib/scoring";
import { sweep } from "@/lib/scoring/sweep";
import { casesById } from "@/lib/store";
import { PLAN_GROUPS, planGroupFor, stageFor, type PlanGroup } from "@/lib/coordination/state";
import { formatDate, formatDateTime, plural } from "@/lib/format";
import { reviewedPatientIds } from "@/lib/stage2/read";
import { RECOMMENDATION_LABEL } from "@/lib/stage2/present";
import { Chip, Mono, Notice, Panel, StateBadge, TierLabel } from "@/components/ui";
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
const STRIPE: Record<PlanGroup, string> = {
  "no plan": "bg-transparent",
  "plan in progress": "bg-warn-stripe",
  "plan complete": "bg-cairn-400",
};

const FIELD_WORDS: Record<string, string> = {
  frailtyCfs: "a Clinical Frailty Scale score",
  weightLossPct: "a weight loss figure",
  carePackageIncreasedAt: "a care package change",
  performanceStatus: "a performance status",
  nyha: "an NYHA class",
  mrcDyspnoea: "an MRC dyspnoea grade",
};

function one(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function applyFilters(rows: WorklistRow[], f: FilterValues): WorklistRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !(r.name ?? "").toLowerCase().includes(q) && !r.patientId.toLowerCase().includes(q)) return false;
    if (f.plan && planGroupFor(r.state) !== f.plan) return false;
    if (f.tier && r.assessment.tier !== f.tier) return false;
    if (f.noPlan === "yes" && (r.assessment.hasPlan || r.assessment.alreadyOnRegister)) return false;
    if (f.group && !r.conditions.some((c) => CONDITION_GROUPS[f.group]?.test(c))) return false;
    if (f.imd && String(r.imdQuintile ?? "") !== f.imd) return false;
    if (f.owner && r.waitingOn?.ownerName !== f.owner) return false;
    return true;
  });
}

function groupRows(rows: WorklistRow[]): { plan: PlanGroup; tiers: { tier: ReviewTier; rows: WorklistRow[] }[] }[] {
  const out: { plan: PlanGroup; tiers: { tier: ReviewTier; rows: WorklistRow[] }[] }[] = [];
  for (const plan of PLAN_GROUPS) {
    const inGroup = rows.filter((r) => planGroupFor(r.state) === plan);
    if (!inGroup.length) continue;
    const tiers = (Object.keys(TIER_ORDER) as ReviewTier[])
      .map((tier) => ({ tier, rows: inGroup.filter((r) => r.assessment.tier === tier) }))
      .filter((t) => t.rows.length);
    out.push({ plan, tiers });
  }
  return out;
}

export default async function WorklistPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const filters: FilterValues = {
    q: one(sp.q),
    plan: one(sp.plan),
    tier: one(sp.tier),
    noPlan: one(sp.noPlan),
    group: one(sp.group),
    imd: one(sp.imd),
    owner: one(sp.owner),
  };

  const [{ patients, meta, mode, degraded }, cases, reviewed] = await Promise.all([getPatients(), casesById(), reviewedPatientIds()]);
  const engine = getEngine();
  const nowIso = meta.simulationNow;
  const assessments = await engine.assessMany(patients, { nowIso });
  const result = sweep(patients, assessments, cases, nowIso);

  const rows = applyFilters(result.rows, filters);
  const groups = groupRows(rows);
  const owners = Array.from(new Set(result.rows.map((r) => r.waitingOn?.ownerName).filter((x): x is string => !!x))).sort();
  const f = result.funnel;

  const summary: [string, number][] = [
    ["patients scanned", f.patientsScanned],
    ["carry indicators", f.indicatorsPresent],
    ["no register entry or plan", f.notOnRegisterOrPlan],
    ["prompted for review", f.promptedForReview],
    ["waiting on somebody", f.waitingOnSomeone],
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-line pb-5">
        <h1 className="font-display text-[28px] leading-[1.1] text-ink sm:text-[32px]">Worklist</h1>
        <p className="text-[12px] leading-5 text-faint tnum">
          {mode === "snapshot" || degraded ? "Snapshot" : "Live"} · simulation clock {formatDate(nowIso)} · taken{" "}
          {formatDateTime(meta.takenAt)}
        </p>
      </header>

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

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-6">
          <WorklistFilters values={filters} owners={owners} imdAvailable={result.equity.imdAvailable} />

          {groups.length === 0 ? (
            <Notice kind="quiet">No patients match this search.</Notice>
          ) : (
            groups.map((g) => (
              <section key={g.plan} aria-labelledby={`plan-${g.plan.replace(/ /g, "-")}`} className="flex flex-col gap-2">
                <div className="flex items-baseline gap-3">
                  <h2 id={`plan-${g.plan.replace(/ /g, "-")}`} className="text-[18px] font-semibold tracking-[-0.01em] text-ink first-letter:uppercase">
                    {g.plan}
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
                        <th className="microlabel w-[16%] px-3 py-2.5">Conditions</th>
                        <th className="microlabel w-[28%] px-3 py-2.5">Indicators present</th>
                        <th className="microlabel w-[15%] px-3 py-2.5">Stage</th>
                        <th className="microlabel px-3 py-2.5">Next action · owner</th>
                      </tr>
                    </thead>
                    {g.tiers.map((t) => (
                      <tbody key={t.tier}>
                        <tr className="border-b border-line bg-surface-2">
                          <td className="p-0" />
                          <td colSpan={6} className="px-3 py-1.5">
                            <TierLabel tier={t.tier} />
                            <span className="ml-2 text-[12px] text-faint tnum">{t.rows.length}</span>
                          </td>
                        </tr>
                        {t.rows.map((r) => (
                          <tr key={r.patientId} className="border-b border-line last:border-b-0 hover:bg-surface-2">
                            <td className="p-0">
                              <span aria-hidden="true" className={`block h-full min-h-[3.25rem] w-1 ${STRIPE[g.plan]}`} />
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
                              <div className="flex flex-col items-start gap-1.5">
                                <Chip tone="brand">{stageFor(r.state)}</Chip>
                                <StateBadge state={r.state} />
                                {(() => {
                                  const rec = reviewed.get(r.patientId);
                                  return rec ? <Chip tone={RECOMMENDATION_LABEL[rec].tone}>{RECOMMENDATION_LABEL[rec].label}</Chip> : null;
                                })()}
                              </div>
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

        <aside className="flex min-w-0 flex-col gap-5">
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
                    <span className="text-faint">(needs {FIELD_WORDS[i.missingField] ?? i.missingField})</span>
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
