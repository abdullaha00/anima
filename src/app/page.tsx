import Link from "next/link";
import type { ReviewTier, WorklistRow } from "@/lib/domain/types";
import { TIER_ORDER } from "@/lib/domain/types";
import { getPatients } from "@/lib/data/source";
import { getEngine } from "@/lib/scoring";
import { sweep } from "@/lib/scoring/sweep";
import { casesById } from "@/lib/store";
import { WORKLIST_ORDER, planGroupFor, type PlanGroup } from "@/lib/coordination/state";
import { formatDate, plural } from "@/lib/format";
import { reviewedPatientIds } from "@/lib/stage2/read";
import { RECOMMENDATION_LABEL } from "@/lib/stage2/present";
import { Chip, Mono, Notice, StateBadge, TierLabel, TIER_TONE } from "@/components/ui";
import { WorklistFilters, type FilterValues } from "@/components/worklist/WorklistFilters";
import { RowLink } from "@/components/worklist/RowLink";

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

/**
 * Short forms of the catalogue labels for the list, keyed by signal id. The full sentence and
 * the evidence behind it stay on the patient page; here a clinician scans a dozen rows at once.
 */
const SHORT_LABEL: Record<string, string> = {
  GEN_ADMISSIONS: "2+ unplanned admissions",
  GEN_FRAILTY: "frailty",
  GEN_WEIGHT: "weight loss",
  GEN_CARE_NEEDS: "increased care needs",
  GEN_PERFORMANCE: "poor performance status",
  DIS_CANCER: "advanced cancer",
  DIS_HEART: "heart failure, symptoms at rest",
  DIS_RESP: "lung disease, breathless at rest",
  DIS_NEURO: "progressive neurological disease",
  DIS_RENAL: "advanced kidney disease",
  DIS_LIVER: "advanced liver disease",
  REC_HEART: "heart failure, no NYHA class",
  REC_RESP: "lung disease, no MRC grade",
  REC_FRAILTY: "frailty, no CFS score",
  REC_RENAL_EGFR: "kidney disease, eGFR under 30",
  REC_ADMISSION_RECENT: "unplanned attendance in 3 months",
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
  for (const plan of WORKLIST_ORDER) {
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

  const [{ patients, meta }, cases, reviewed] = await Promise.all([getPatients(), casesById(), reviewedPatientIds()]);
  const engine = getEngine();
  const nowIso = meta.simulationNow;
  const assessments = await engine.assessMany(patients, { nowIso });
  const result = sweep(patients, assessments, cases, nowIso);

  const rows = applyFilters(result.rows, filters);
  const groups = groupRows(rows);
  const owners = Array.from(new Set(result.rows.map((r) => r.waitingOn?.ownerName).filter((x): x is string => !!x))).sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-line pb-5">
        <h1 className="font-display text-[28px] leading-[1.1] text-ink sm:text-[32px]">Worklist</h1>
      </header>

      {result.modelDisclosure ? <Notice kind="info">{result.modelDisclosure}</Notice> : null}

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
              <div className="overflow-x-auto rounded-lg bg-surface shadow-sm">
                <table className="w-full min-w-[720px] table-fixed text-[13px]">
                  <thead className="text-left">
                    <tr className="border-b-2 border-line">
                      <th className="w-1 p-0" aria-hidden="true" />
                      <th className="microlabel w-[24%] px-3 py-2.5">Patient</th>
                      <th className="microlabel w-[6%] px-2 py-2.5 tnum">Age</th>
                      <th className="microlabel w-[18%] px-3 py-2.5">Conditions</th>
                      <th className="microlabel w-[30%] px-3 py-2.5">Indicators present</th>
                      <th className="microlabel px-3 py-2.5">Next action · owner</th>
                    </tr>
                  </thead>
                  {g.tiers.map((t) => (
                    <tbody key={t.tier}>
                      <tr className={`border-b border-line ${TIER_TONE[t.tier].band}`}>
                        <td className="p-0" />
                        <td colSpan={5} className="px-3 py-1.5">
                          <TierLabel tier={t.tier} />
                          <span className="ml-2 text-[12px] text-faint tnum">{t.rows.length}</span>
                        </td>
                      </tr>
                      {t.rows.map((r) => {
                        const rec = reviewed.get(r.patientId);
                        const showState = r.state !== "flagged";
                        const signals = r.assessment.signals;
                        return (
                          <RowLink key={r.patientId} href={`/patient/${r.patientId}`} className="border-b border-line last:border-b-0">
                            <td className="p-0">
                              <span aria-hidden="true" className={`block h-full min-h-[3.25rem] w-1 ${STRIPE[g.plan]}`} />
                            </td>
                            <td className="px-3 py-3 align-top">
                              <Link
                                href={`/patient/${r.patientId}`}
                                className="rounded-xs text-[15px] font-bold tracking-[-0.01em] text-ink hover:text-primary"
                              >
                                {r.name ?? r.patientId}
                              </Link>
                              <div className="mt-0.5">
                                <Mono className="text-faint">{r.patientId}</Mono>
                              </div>
                              {showState || rec ? (
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  {showState ? <StateBadge state={r.state} /> : null}
                                  {rec ? <Chip tone={RECOMMENDATION_LABEL[rec].tone}>{RECOMMENDATION_LABEL[rec].label}</Chip> : null}
                                </div>
                              ) : null}
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
                              <span className="font-semibold text-ink tnum">{plural(signals.length, "indicator")}</span>
                              {signals.length ? (
                                <span className="text-secondary"> · {signals.map((s) => SHORT_LABEL[s.id] ?? s.label).join(" · ")}</span>
                              ) : null}
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
                          </RowLink>
                        );
                      })}
                    </tbody>
                  ))}
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
