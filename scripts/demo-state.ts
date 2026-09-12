/**
 * Demo helper: walk the demo patient to a chosen stage in data/state, or reset it, so a
 * rehearsal can start from any point. `npm run demo:reset` clears it before the real demo.
 *
 *   npx tsx scripts/demo-state.ts team|thread|outcome|promoted|refused|signed|shared|reset
 */
process.env.SIM_MODE = "snapshot";
const stage = process.argv[2] ?? "shared";
const PATIENT = "SIM-000001";

async function main() {
  const actions = await import("@/app/actions");
  const store = await import("@/lib/store");
  if (stage === "reset") {
    await store.resetCase(PATIENT);
    console.log("reset");
    return;
  }
  await store.resetCase(PATIENT);
  const steps: string[] = ["team", "thread", "outcome", "promoted", "refused", "signed", "shared"];
  const upTo = steps.indexOf(stage);
  const check = (r: { ok: boolean; error?: string }, l: string) => {
    if (!r.ok) throw new Error(`${l}: ${r.error}`);
  };
  check(await actions.assembleTeam(PATIENT), "assembleTeam");
  if (upTo < 1) return console.log("at team");
  check(await actions.openThread(PATIENT, "professional", "Agree an advance care plan and a preferred place of care, following the recent hospital attendance for breathlessness."), "openThread");
  let c = await store.getCase(PATIENT);
  const thread = c.threads.find((t) => t.channel === "professional")!;
  check(
    await actions.postMessage(PATIENT, thread.id, {
      kind: "proposal",
      body: "Propose home as the preferred place of care, in line with what Amira has said matters to her.",
      proposesField: "preferred_place_of_care",
      proposesValue: "Home",
    }),
    "proposal",
  );
  check(await actions.openThread(PATIENT, "family", "Keep Amira's daughter informed about practical arrangements and who to call."), "family thread");
  c = await store.getCase(PATIENT);
  const fam = c.threads.find((t) => t.channel === "family")!;
  check(await actions.postMessage(PATIENT, fam.id, { kind: "message", body: "Amira has said she would like to stay at home with a clear contact for help. We are arranging a home visit this week." }), "family msg");
  if (upTo < 2) return console.log("at thread");
  c = await store.getCase(PATIENT);
  const proposal = c.threads[0].messages.find((m) => m.kind === "proposal" && m.authorId === "p-gp")!;
  const owner = c.participants.find((p) => p.channel === "professional" && !p.recipientOnly && p.id !== "p-gp")!;
  const matron = c.participants.find((p) => p.role === "community nurse" || p.role === "community matron") ?? owner;
  check(
    await actions.recordOutcome(PATIENT, {
      heldAt: "2026-09-12",
      summary: "Agreed that home is the preferred place of care, with community nursing and a named out-of-hours contact. CPR to be discussed with Amira at the home visit before anything is recorded.",
      attendees: ["p-gp", owner.id, matron.id],
      apologies: [],
      decisions: [
        { text: "Home is the preferred place of care.", fromMessageId: proposal.id, intoRecordField: "preferred_place_of_care", proposedValue: "Home" },
        { text: "Community nursing to visit this week and confirm the out-of-hours contact." },
      ],
      nextSteps: [
        { what: "Home visit and review of breathlessness at night", ownerId: owner.id, due: "2026-09-16", createdFrom: proposal.id },
        { what: "Confirm the out-of-hours contact number with Amira's daughter", ownerId: matron.id, due: "2026-09-19" },
      ],
    }),
    "recordOutcome",
  );
  if (upTo < 3) return console.log("at outcome");
  check(await actions.promoteDecision(PATIENT, 0), "promote");
  if (upTo < 4) return console.log("at promoted");
  const refused = await actions.attemptCairnSignature(PATIENT);
  console.log("cairn attempt:", refused);
  if (upTo < 5) return console.log("at refused");
  const values: [string, string][] = [
    ["what_matters", "To stay at home with a clear contact for help, and to avoid unnecessary travel."],
    ["concerns_and_fears", "Being breathless at night with nobody to call."],
    ["clinical_summary", "Heart failure and chronic kidney disease. Attended the emergency department on 12 September with breathlessness; two hospital episodes this month."],
    ["preferences_for_care", "Priority on comfort. Avoid admission where symptoms can be managed at home."],
    ["recommended_interventions", "Community nursing visits, home monitoring, anticipatory medicines reviewed, out-of-hours service aware."],
    ["not_recommended", "Not for critical care admission or intubation."],
    ["cpr_recommendation", "CPR not recommended. Discussed with Amira and her daughter, understood and agreed."],
    ["capacity_assessment", "Has capacity for these decisions."],
    ["people_involved", "Daughter present at the conversation. GP, heart failure specialist nurse and community nursing informed."],
  ];
  for (const [f, v] of values) check(await actions.setRecordField(PATIENT, f as never, v, "conversation 12 Sep 2026 with Dr Maya Shah, home visit"), f);
  check(await actions.signRecord(PATIENT, "Dr Maya Shah"), "sign");
  if (upTo < 6) return console.log("at signed");
  check(await actions.shareRecord(PATIENT, ["gp", "out_of_hours", "ambulance", "hospice", "family"]), "share");
  console.log("at shared");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
