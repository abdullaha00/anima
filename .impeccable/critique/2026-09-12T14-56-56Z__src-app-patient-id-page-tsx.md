---
target: src/app/patient/[id]/page.tsx
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\PCAdmin\\OneDrive\\Coding Projects\\openai-anima-hackathon\\anima\\src\\app\\patient\\[id]\\page.tsx"
target_fingerprint: "sha256:bfdb4e7607fd3d555ceb0a9350531e6cf9f268f41e8cf5ed7d5558036c86e524"
target_path: "C:\\Users\\PCAdmin\\OneDrive\\Coding Projects\\openai-anima-hackathon\\anima\\src\\app\\patient\\[id]\\page.tsx"
timestamp: 2026-09-12T14-56-56Z
slug: src-app-patient-id-page-tsx
---
# Critique: patient screen (src/app/patient/[id]/page.tsx)

Method: dual-agent (A: design review · B: detector)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | "Generated, decision support only" hidden inside the fold |
| 2 | Match system / real world | 2 | First-person review summary, slash compounds, mixed dates |
| 3 | User control and freedom | 3 | No expand-all; paged list 5+4 |
| 4 | Consistency and standards | 2 | Two verdicts with no relation; rec chip shares the complete green |
| 5 | Error prevention | 3 | "3 episodes" vs "Two or more" |
| 6 | Recognition rather than recall | 2 | "Go to the record" assumes knowledge |
| 7 | Flexibility and efficiency | 2 | Single path |
| 8 | Aesthetic and minimalist design | 2 | 220-word paragraph; repeated dates; "no plan" three ways |
| 9 | Error recovery | 3 | Failed review gives no next step |
| 10 | Help and documentation | 2 | Codes and chips unexplained |
| Total | | 24/40 | |

Design specificity: one authored moment (own words) plus the Why panel; interchangeable below. Detector: 0 findings. Overlays skipped (no browser automation).

Priority issues:
- P0 Review summary wall of prose: cap to three sentences, fold the rest, rewrite first person.
- P1 Two unrelated verdicts: state the review's position in the Why panel; info tone chip.
- P1 Unframed action, last on mobile: reassurance line, action first on small screens.
- P2 Evidence chain closed by default; mono code loudest: open first drawer, code inside.
- P2 Simulator copy in clinical facts: drop the parenthetical summary.

Persona red flags: GP reads 220 words to reconcile verdicts; consultant sees "I found", green approval chip, "synthetic".
Minor: heading repeats the name; plan pill far from name; page size 5.
Questions: review prose on the record page instead? words first? empty goals as a call to action?
