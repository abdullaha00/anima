import type { CaseState } from "@/lib/domain/types";
import { PreparationStatus } from "./ClinicalReview";
export function PreparationSection({ caseState }: { caseState: CaseState }) {
  if (!caseState.preparationSteps?.length) return null;
  return <section id="preparation" className="space-y-4 rounded border p-5"><h2 className="text-xl font-semibold">Preparation actions</h2><p>Clinician-confirmed actions stored in Cairn, before a discussion is held. These are not simulator bookings or messages.</p>
    {caseState.preparationSteps.map(step => {
      const decision = caseState.screeningReviews?.find(r => r.preparationStepId === step.id);
      const owner = caseState.participants.find(p => p.id === step.ownerId);
      return <article key={step.id} className="rounded border p-4"><h3 className="font-semibold">{step.what}</h3><p>Owner: {owner?.name ?? "Owner no longer on the care team — clarify ownership"} · due {step.due} · {step.status}</p>{step.blockedReason && <p>{step.blockedReason}</p>}
        {decision && <p>From the screening decision recorded on the patient page ({decision.decision}, revision {decision.revision}).</p>}
        <p className="text-xs text-secondary">Saved action {step.id}</p>
        {step.status === "open" && <PreparationStatus patientId={caseState.patientId} step={step} enabled={process.env.CAIRN_DEMO_ACTIONS === "true"} />}
      </article>;
    })}
  </section>;
}
