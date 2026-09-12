"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

type StageOneResult = {
  status: string;
  decision: string;
  explanation: string;
  supportingEvidence: { interpretation: string }[];
  contradictoryEvidence: { interpretation: string }[];
  limitations: string[];
};

type StageTwoResult = {
  recommendation: string;
  summary: string;
};

type StreamEvent =
  | { type: "phase"; phase: "stage1" | "stage2"; message: string }
  | { type: "stage1"; result: StageOneResult }
  | { type: "complete"; patientId: string; stage1: StageOneResult; stage2: StageTwoResult }
  | { type: "heartbeat" }
  | { type: "error"; message: string };

const STAGE_ONE_MESSAGES = [
  "Gathering current demographics, conditions and records",
  "Checking the exact three-calendar-month review window",
  "Separating current evidence from later record entries",
  "Reviewing deterioration, function and service use",
  "Checking contradictory evidence and missing sources",
];

const STAGE_TWO_MESSAGES = [
  "Reviewing whether a conversation is appropriate",
  "Checking existing planning and recorded wishes",
  "Identifying current support and care setting",
  "Finding the responsible care team and owner",
  "Preparing meeting notes and immediate actions",
  "Independently checking for false positives",
];

function ResultCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 text-left shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-affirm-soft text-[12px] font-bold text-affirm">✓</span>
        <h3 className="text-[14px] font-semibold text-ink">{label}</h3>
      </div>
      {children}
    </section>
  );
}

export function ReassessButton({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"stage1" | "stage2" | "complete">("stage1");
  const [messageIndex, setMessageIndex] = useState(0);
  const [stageOne, setStageOne] = useState<StageOneResult>();
  const [stageTwo, setStageTwo] = useState<StageTwoResult>();
  const [error, setError] = useState("");

  const messages = useMemo(() => phase === "stage2" ? STAGE_TWO_MESSAGES : STAGE_ONE_MESSAGES, [phase]);
  useEffect(() => {
    if (!open || phase === "complete" || error) return;
    setMessageIndex(0);
    const timer = window.setInterval(() => setMessageIndex((value) => (value + 1) % messages.length), 2200);
    return () => window.clearInterval(timer);
  }, [open, phase, messages, error]);

  async function start() {
    setOpen(true);
    setPhase("stage1");
    setStageOne(undefined);
    setStageTwo(undefined);
    setError("");

    try {
      const response = await fetch("/api/reassess", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId }),
      });
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Unable to start the live review.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as StreamEvent;
          if (event.type === "stage1") setStageOne(event.result);
          if (event.type === "phase") setPhase(event.phase);
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "complete") {
            setStageOne(event.stage1);
            setStageTwo(event.stage2);
            setPhase("complete");
            sessionStorage.setItem(`cairn:reassessment:${event.patientId}`, JSON.stringify({
              stage1: event.stage1,
              stage2: event.stage2,
              savedAt: new Date().toISOString(),
            }));
            window.setTimeout(() => router.push(`/patient/${event.patientId}`), 1200);
          }
        }
        if (done) break;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The live review could not be completed.");
    }
  }

  return (
    <>
      <Button variant="primary" onClick={start}>Re-assess</Button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4" role="dialog" aria-modal="true" aria-labelledby="reassess-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-line bg-ground p-5 shadow-lg sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="microlabel">Live record review · {patientId}</p>
                <h2 id="reassess-title" className="mt-1 font-display text-[24px] leading-tight text-ink">Re-assessing the current record</h2>
              </div>
              {error ? <Button onClick={() => setOpen(false)}>Close</Button> : null}
            </div>

            <div className="mt-5 flex flex-col gap-3" aria-live="polite">
              {stageOne ? (
                <ResultCard label="Phase 1 complete">
                  <p className="text-[14px] leading-6 text-ink">{stageOne.explanation}</p>
                  <p className="mt-2 text-[12px] font-semibold text-muted">Outcome: {stageOne.decision.replaceAll("_", " ")}</p>
                </ResultCard>
              ) : null}

              {stageTwo ? (
                <ResultCard label="Phase 2 complete">
                  <p className="text-[14px] leading-6 text-ink">{stageTwo.summary}</p>
                </ResultCard>
              ) : null}

              {!error && phase !== "complete" ? (
                <section className="overflow-hidden rounded-lg border border-primary-border bg-primary-soft p-4">
                  <div className="flex items-center gap-3">
                    <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-cairn-200 border-t-primary" aria-hidden="true" />
                    <div>
                      <p className="text-[13px] font-semibold text-affirm">{phase === "stage1" ? "Phase 1 · record screening" : "Phase 2 · conversation preparation"}</p>
                      <p key={`${phase}-${messageIndex}`} className="mt-0.5 animate-pulse text-[14px] text-ink">{messages[messageIndex]}…</p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-1.5" aria-hidden="true">
                    {[0, 1, 2].map((item) => <span key={item} className={`h-1.5 animate-pulse rounded-full ${item === 0 || phase === "stage2" ? "bg-primary" : "bg-cairn-200"}`} />)}
                  </div>
                </section>
              ) : null}

              {phase === "complete" ? <p className="text-center text-[13px] font-semibold text-affirm">Review complete. Opening the patient record…</p> : null}
              {error ? <p className="rounded-md border border-warn-border bg-warn-soft p-4 text-[14px] text-warn">{error}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
