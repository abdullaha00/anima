import Link from "next/link";
import type { WorklistRow } from "@/lib/domain/types";
import { getPatients } from "@/lib/data/source";
import { getEngine } from "@/lib/scoring";
import { screeningMarkers, sweep } from "@/lib/scoring/sweep";
import { casesById } from "@/lib/store";
import { WORKLIST_ORDER, planGroupForRow, type PlanGroup } from "@/lib/coordination/state";
import { plural } from "@/lib/format";
import { Chip, Mono, Notice, StateBadge } from "@/components/ui";
import { WorklistFilters, type FilterValues } from "@/components/worklist/WorklistFilters";
import { RowLink } from "@/components/worklist/RowLink";
import { PagedRows } from "@/components/worklist/PagedRows";
import { ReassessButton } from "@/components/worklist/ReassessButton";

const PAGE_SIZE = 10;

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

/** The left-edge stripe encodes progress, never urgency: amber in progress or due a review, green complete. */
const STRIPE: Record<PlanGroup, string> = {
  "no plan": "bg-transparent",
  "plan in progress": "bg-warn-stripe",
  "review plan": "bg-warn-stripe",
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

function applyFilters(rows: WorklistRow[], f: FilterValues, nowIso: string): WorklistRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (q && !(r.name ?? "").toLowerCase().includes(q) && !r.patientId.toLowerCase().includes(q)) return false;
    if (f.plan && planGroupForRow(r.state, r.lastTouchedAt, nowIso) !== f.plan) return false;
    if (f.tier && r.assessment.tier !== f.tier) return false;
    if (f.noPlan === "yes" && (r.assessment.hasPlan || r.assessment.alreadyOnRegister)) return false;
    if (f.group && !r.conditions.some((c) => CONDITION_GROUPS[f.group]?.test(c))) return false;
    if (f.owner && r.clinician !== f.owner) return false;
    return true;
  });
}

/** Rows keep the sweep's order (state, then tier, then rank) inside each plan group. */
function groupRows(rows: WorklistRow[], nowIso: string): { plan: PlanGroup; rows: WorklistRow[] }[] {
  const out: { plan: PlanGroup; rows: WorklistRow[] }[] = [];
  for (const plan of WORKLIST_ORDER) {
    const inGroup = rows.filter((r) => planGroupForRow(r.state, r.lastTouchedAt, nowIso) === plan);
    if (inGroup.length) out.push({ plan, rows: inGroup });
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
    owner: one(sp.owner),
  };

  const [{ patients, meta }, cases, screenings] = await Promise.all([getPatients(), casesById(), screeningMarkers()]);
  const engine = getEngine();
  const nowIso = meta.simulationNow;
  const assessments = await engine.assessMany(patients, { nowIso });
  const result = sweep(patients, assessments, cases, nowIso, { screenings });

  const rows = applyFilters(result.rows, filters, nowIso);
  const groups = groupRows(rows, nowIso);
  const owners = Array.from(new Set(result.rows.map((r) => r.clinician))).sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-line pb-5">
        <h1 className="font-display text-[28px] leading-[1.1] text-ink sm:text-[32px]">Worklist</h1>
      </header>

      {result.modelDisclosure ? <Notice kind="info">{result.modelDisclosure}</Notice> : null}

      <div className="flex min-w-0 flex-col gap-6">
        <WorklistFilters values={filters} owners={owners} />

        {groups.length === 0 ? (
          <Notice kind="quiet">No patients match this search.</Notice>
        ) : (
          groups.map((g) => (
            <section key={g.plan} aria-labelledby={`plan-${g.plan.replace(/ /g, "-")}`} className="flex flex-col gap-2">
              <div className="flex items-baseline gap-3">
                <h2 id={`plan-${g.plan.replace(/ /g, "-")}`} className="text-[18px] font-semibold tracking-[-0.01em] text-ink first-letter:uppercase">
                  {g.plan}
                </h2>
                <span className="text-[13px] font-medium text-secondary tnum">{plural(g.rows.length, "patient")}</span>
              </div>
              <div className="overflow-x-auto rounded-lg bg-surface shadow-sm">
                {/* Below md each row stacks as a card; from md up it is the same fixed table as before. */}
                <table className="w-full text-[13px] md:min-w-[720px] md:table-fixed">
                  <thead className="hidden text-left md:table-header-group">
                    <tr className="border-b-2 border-line">
                      <th className="w-1 p-0" aria-hidden="true" />
                      <th className="microlabel w-[24%] px-3 py-2.5">Patient</th>
                      <th className="microlabel w-[6%] px-2 py-2.5 tnum">Age</th>
                      <th className="microlabel w-[18%] px-3 py-2.5">Conditions</th>
                      <th className="microlabel w-[24%] px-3 py-2.5">Indicators present</th>
                      <th className="microlabel w-[12%] px-3 py-2.5">Clinician</th>
                      <th className="microlabel w-[16%] px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <PagedRows
                    pageSize={PAGE_SIZE}
                    colSpan={7}
                    rows={g.rows.map((r) => {
                      const showState = r.state !== "flagged";
                      const signals = r.assessment.signals;
                      return (
                        <RowLink key={r.patientId} href={`/patient/${r.patientId}`} className="border-b border-line last:border-b-0">
                          <td className="hidden p-0 md:table-cell">
                            <span aria-hidden="true" className={`block h-full min-h-[3.25rem] w-1 ${STRIPE[g.plan]}`} />
                          </td>
                          <td className="block w-full p-0 md:table-cell md:w-auto md:px-3 md:py-3 md:align-top">
                            <Link
                              href={`/patient/${r.patientId}`}
                              className="rounded-xs text-[15px] font-bold tracking-[-0.01em] text-ink hover:text-primary"
                            >
                              {r.name ?? r.patientId}
                            </Link>
                            <div className="mt-0.5">
                              <Mono className="text-faint">{r.patientId}</Mono>
                            </div>
                            {showState || r.screening === "above" ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {showState ? <StateBadge state={r.state} /> : null}
                                {r.screening === "above" ? <Chip tone="info">Screening: above threshold</Chip> : null}
                              </div>
                            ) : null}
                          </td>
                          <td className="mr-3 mt-2 block p-0 text-secondary tnum md:mr-0 md:mt-0 md:table-cell md:px-2 md:py-3 md:align-top">
                            <span className="mr-1 text-[12px] font-semibold text-muted md:hidden">Age</span>
                            {r.age !== undefined ? r.age : "—"}
                          </td>
                          <td className="mt-2 block min-w-0 flex-1 p-0 md:mt-0 md:table-cell md:px-3 md:py-3 md:align-top">
                            <div className="flex flex-wrap gap-1">
                              {r.conditions.length ? (
                                r.conditions.map((c) => <Chip key={c}>{c}</Chip>)
                              ) : (
                                <span className="text-muted">none coded</span>
                              )}
                            </div>
                          </td>
                          <td className="mt-2 block w-full p-0 text-[13px] text-ink md:mt-0 md:table-cell md:w-auto md:px-3 md:py-3 md:align-top">
                            <span className="block text-[12px] font-semibold text-muted md:hidden">Indicators</span>
                            {signals.length ? (
                              signals.map((s) => SHORT_LABEL[s.id] ?? s.label).join(" · ")
                            ) : (
                              <span aria-label="no indicators recorded" className="text-faint">—</span>
                            )}
                          </td>
                          <td className="mt-1.5 block w-full p-0 text-[13px] text-secondary md:mt-0 md:table-cell md:w-auto md:px-3 md:py-3 md:align-top md:text-ink">
                            <span className="mr-1 text-[12px] font-semibold text-muted md:hidden">Clinician</span>
                            {r.clinician}
                            {r.state === "paused" && r.pausedReason ? (
                              <div className="mt-0.5 text-secondary">paused: {r.pausedReason}</div>
                            ) : null}
                          </td>
                          <td className="mt-3 block w-full p-0 md:mt-0 md:table-cell md:px-3 md:py-2 md:text-right md:align-top">
                            <ReassessButton patientId={r.patientId} />
                          </td>
                        </RowLink>
                      );
                    })}
                  />
                </table>
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
