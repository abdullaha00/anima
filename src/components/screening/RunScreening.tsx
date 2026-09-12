"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { requestScreening } from "@/app/screening/actions";
export function RunScreening({ enabled, retry }: { enabled: boolean; retry?: string }) {
  const [state, action, pending] = useActionState(requestScreening, { message: "" });
  return <form action={action} className="space-y-2 rounded border p-4">
    {retry ? <input type="hidden" name="retry" value={retry} /> : <label className="block font-semibold">Simulator patient ID <input name="patientId" placeholder="SIM-000001" pattern="SIM-[0-9]{6}" required className="ml-3 rounded border p-2 font-normal" /></label>}
    <button disabled={!enabled || pending} className="rounded border px-4 py-2 font-semibold disabled:opacity-50">{pending ? "Queuing…" : retry ? "Retry failed screening" : "Run fresh screening"}</button>
    {!enabled && <p className="text-sm">Local demo controls are disabled. An operator can use the authenticated screening API.</p>}
    {!retry && enabled && <p className="text-sm">Local fictional demo using the configured clinician identity. The Stage 1 and Stage 2 workers must be running.</p>}
    <p role="status" className="text-sm">{state.message}</p>
  </form>;
}
export function RefreshPending({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => { if (!active) return; const timer = setInterval(() => router.refresh(), 5000); return () => clearInterval(timer); }, [active, router]);
  return active ? <p className="text-sm" role="status">Processing status refreshes every five seconds.</p> : null;
}
