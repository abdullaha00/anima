#!/usr/bin/env node
/**
 * Build an offline, leakage-aware mortality cohort by augmenting the preserved
 * data/mortality-cohort snapshot with invented synthetic event timelines.
 *
 * The authored event specifications are embedded below so this builder is
 * reproducible from the repository checkout. It deliberately has no network
 * client and never calls or mutates the simulator API.
 *
 * Usage:
 *   node scripts/build-enriched-mortality-cohort.mjs
 *   node scripts/build-enriched-mortality-cohort.mjs --validate
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_DIR = path.join(ROOT, 'data', 'mortality-cohort');
const OUT_DIR = path.join(ROOT, 'data', 'mortality-cohort-enriched');
const HORIZONS = [30, 60, 90];
const PILOT_HORIZON_DAYS = 15;
const PILOT_PATIENT_IDS = ['SIM-000499', 'SIM-000472', 'SIM-000464'];
const PILOT_FILE = 'pilot-authored-deaths-asof-15d.ndjson';
const ALL_AUTHORED_15D_FILE = 'all-authored-deaths-asof-15d.ndjson';
const TARGET_PATIENTS = 100;
const TARGET_TRUE_DEATHS = 5;
const TARGET_AUTHORED_DEATHS = 34;
const TARGET_LIVING_CONTROLS = 61;
const TARGET_ELIGIBLE_DEATHS = 38;
const SNAPSHOT_AT = '2026-10-18T23:59:59.999Z';
const BASE_SNAPSHOT_AT = '2026-09-12T08:00:00.000Z';
const CONTROL_EXCLUDED_TO_FIT_TARGET = 'SIM-000039';
const MAX_RESOURCES_PER_PATIENT = 100;
const MAX_RESOURCES_TOTAL = 10_000;
const SIMULATOR_TRUE_DEATH = 'simulator-recorded-death';
const AUTHORED_DEATH = 'authored-synthetic-mortality-v2';
const LIVING_LABEL = 'alive-at-base-snapshot';
const INELIGIBLE_REASON = 'non-medical cause: Road traffic collision';

// These are the four plan artifacts supplied for this build. Keeping the data
// in this source file avoids a hidden dependency on the orchestration workspace.
const AUTHORED_DEATHS = [{"patientId":"SIM-000499","deathDate":"2026-08-24","deathCause":"Acute-on-chronic heart failure","events":[{"date":"2026-05-03T08:15:00Z","kind":"encounter","service":"gp","title":"Early fluid-retention review","data":{"text":"She reports breathlessness on the stairs and evening ankle swelling, but remains comfortable at rest; medication-taking is unchanged.","reason":"Heart failure review","channel":"telephone"}},{"date":"2026-05-03T08:25:00Z","kind":"observation","service":"gp","title":"Weight and ankle assessment","data":{"value":"Weight 79.8 kg, up 1.8 kg from her reported baseline; mild bilateral ankle oedema","category":"clinical"}},{"date":"2026-06-19T08:00:00Z","kind":"report","service":"diagnostics","title":"Urea and electrolytes follow-up","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"collectedAt":"2026-06-19T08:00:00Z","analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":139,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.6,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":9.4,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":128,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":48,"referenceLow":60,"referenceHigh":120}]}},{"date":"2026-07-26T09:20:00Z","kind":"encounter","service":"gp","title":"Increasing orthopnoea","data":{"text":"Over the past fortnight she is sleeping propped up and needs pauses after a short walk; ankle swelling now reaches the shins.","reason":"Worsening exertional breathlessness","channel":"telephone"}},{"date":"2026-08-18T06:40:00Z","kind":"hospital-attendance","service":"hospital","title":"Breathlessness and fluid overload","data":{"stage":"arrived","acuity":2,"location":"acute medical unit","arrivalAt":"2026-08-18T06:40:00Z","clinician":"acute medical team","presentingComplaint":"Progressive orthopnoea with bilateral leg swelling"}},{"date":"2026-08-21T15:10:00Z","kind":"discharge-summary","service":"hospital","title":"Heart failure assessment and handover","data":{"stage":"sent","sentAt":"2026-08-21T15:10:00Z","sentBy":"Acute medicine team","assignee":"Heart failure service","sections":{"course":"Admitted with orthopnoea and peripheral oedema on heart failure and CKD background; IV diuresis gave partial relief.","reason":"Unplanned assessment for increasing breathlessness and fluid retention over two weeks.","results":"Chest radiograph suggested pulmonary congestion; renal function was monitored, with no clear precipitant identified.","followUp":"Heart failure nurses to review weight and symptoms within several days; renal blood tests requested after discharge.","diagnoses":"Decompensated heart failure was the working diagnosis; coexisting CKD limited the pace of diuresis.","gpActions":"Please reconcile diuretics, check the home weight record and assess recurrent orthopnoea or reduced urine output.","medicationChanges":"Loop diuretic dose was adjusted during admission; the discharge list should be checked against community supply."}}}]},{"patientId":"SIM-000472","deathDate":"2026-08-26","deathCause":"Pneumonia with sepsis","events":[{"date":"2026-05-06T08:15:00Z","kind":"encounter","service":"gp","title":"Reduced appetite and cough","data":{"text":"He has felt more tired and is eating less, with an occasional dry cough and chills; no measured fever or resting breathlessness reported.","reason":"Long-term condition review","channel":"telephone"}},{"date":"2026-05-06T08:27:00Z","kind":"observation","service":"gp","title":"Low-grade temperature check","data":{"value":"Temperature 37.5 C; oxygen saturation 95% on air at rest","category":"clinical"}},{"date":"2026-06-23T07:50:00Z","kind":"report","service":"diagnostics","title":"Neutrophil and haemoglobin review","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"collectedAt":"2026-06-23T07:50:00Z","analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":102,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":1.2,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":276,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":86.5,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":0.7,"referenceLow":2,"referenceHigh":7.5}]}},{"date":"2026-07-18T08:05:00Z","kind":"report","service":"diagnostics","title":"Inflammatory marker review","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"collectedAt":"2026-07-18T08:05:00Z","analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":18.4,"referenceLow":0,"referenceHigh":5}]}},{"date":"2026-07-19T10:30:00Z","kind":"encounter","service":"gp","title":"Productive cough and confusion","data":{"text":"Cough is now productive and he becomes short of breath walking to the bathroom; appetite has fallen further and family report intermittent confusion.","reason":"New cough and reduced exercise tolerance","channel":"telephone"}},{"date":"2026-08-12T22:10:00Z","kind":"hospital-attendance","service":"hospital","title":"Febrile cough with low oxygen level","data":{"stage":"arrived","acuity":2,"location":"emergency assessment unit","arrivalAt":"2026-08-12T22:10:00Z","clinician":"emergency medical team","presentingComplaint":"Productive cough, rigors and increasing breathlessness"}},{"date":"2026-08-23T16:00:00Z","kind":"discharge-summary","service":"hospital","title":"Lower respiratory infection handover","data":{"stage":"sent","sentAt":"2026-08-23T16:00:00Z","sentBy":"Acute medicine team","assignee":"Respiratory team","sections":{"course":"Admitted with lower respiratory symptoms, hypoxia and neutropenia; IV antibiotics and oxygen gave only transient improvement.","reason":"Unplanned admission for suspected lower respiratory infection with marked neutropenia.","results":"Chest imaging showed a new right basal opacity; cultures were taken, with no organism confirmed in the available report.","followUp":"Respiratory and acute medicine teams to reassess oxygen requirement and repeat the blood count if appropriate.","diagnoses":"Pneumonia was suspected with worsening cough and hypoxia; sepsis remained a concern during deterioration.","gpActions":"Please confirm the antibiotic course, review safety-net advice and liaise with hospital if the position changes.","medicationChanges":"Antimicrobial treatment and supplemental oxygen were commenced in hospital; the final medication list requires reconciliation."}}}]},{"patientId":"SIM-000464","deathDate":"2026-08-28","deathCause":"Diabetic ketoacidosis","events":[{"date":"2026-05-09T08:20:00Z","kind":"encounter","service":"gp","title":"Thirst and nocturia review","data":{"text":"She has been thirstier and waking to pass urine, with a capillary reading above her usual range; she denies vomiting and is still taking fluids.","reason":"Diabetes review","channel":"telephone"}},{"date":"2026-06-26T07:45:00Z","kind":"report","service":"diagnostics","title":"Glycaemic control review","data":{"kind":"blood-result","panel":{"id":"hba1c","name":"HbA1c"},"collectedAt":"2026-06-26T07:45:00Z","analytes":[{"id":"hba1c","name":"HbA1c","unit":"mmol/mol","value":61,"referenceLow":20,"referenceHigh":41}]}},{"date":"2026-07-31T11:10:00Z","kind":"encounter","service":"gp","title":"Nausea and persistent hyperglycaemia","data":{"text":"Over several days she has developed nausea, abdominal discomfort and marked lethargy; home glucose readings remain high despite drinking more water.","reason":"Symptomatic hyperglycaemia","channel":"in-person"}},{"date":"2026-08-22T19:35:00Z","kind":"hospital-attendance","service":"hospital","title":"Hyperglycaemia with vomiting and dehydration","data":{"stage":"arrived","acuity":2,"location":"emergency assessment unit","arrivalAt":"2026-08-22T19:35:00Z","clinician":"emergency medical team","presentingComplaint":"Persistent hyperglycaemia, vomiting and increasing drowsiness"}},{"date":"2026-08-25T14:30:00Z","kind":"discharge-summary","service":"hospital","title":"Diabetes emergency handover","data":{"stage":"sent","sentAt":"2026-08-25T14:30:00Z","sentBy":"Diabetes inpatient team","assignee":"Diabetes specialist nurse","sections":{"course":"Brought in with several days of hyperglycaemia and vomiting, dehydration and ketones on bedside testing; fluids and insulin were commenced.","reason":"Unplanned assessment for symptomatic hyperglycaemia in a person with diabetes.","results":"Capillary glucose was 29 mmol/L and blood ketones 5.1 mmol/L; venous pH improved after treatment, though observation continued.","followUp":"Diabetes team to review injection technique, sick-day rules and monitoring supplies before discharge.","diagnoses":"Diabetic ketoacidosis was the working diagnosis; the precipitating illness was not established at handover.","gpActions":"Please reconcile diabetes medicines, check recent readings and arrange urgent review if intake or alertness worsens.","medicationChanges":"Intravenous fluids and insulin were given; the continuing regimen was left for the diabetes team to confirm."}}}]},{"patientId":"SIM-000437","deathDate":"2026-08-31","deathCause":"Hyperkalaemic arrhythmia complicating acute kidney injury","events":[{"date":"2026-05-12T08:15:00Z","kind":"encounter","service":"gp","title":"Fatigue and ankle swelling","data":{"text":"He notes more fatigue and evening ankle puffiness, with two nights of poor sleep; he has not reported chest pain or a change in urine colour.","reason":"Chronic kidney disease review","channel":"telephone"}},{"date":"2026-05-12T08:25:00Z","kind":"observation","service":"gp","title":"Blood pressure and oedema check","data":{"value":"Blood pressure 154/88 mmHg; mild bilateral ankle oedema; pulse 78 bpm","category":"clinical"}},{"date":"2026-06-29T08:05:00Z","kind":"report","service":"diagnostics","title":"Renal function and potassium review","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"collectedAt":"2026-06-29T08:05:00Z","analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":140,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.8,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":11.8,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":140,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":45,"referenceLow":60,"referenceHigh":120}]}},{"date":"2026-07-24T09:45:00Z","kind":"encounter","service":"gp","title":"Oliguria and worsening oedema","data":{"text":"His legs are swelling earlier in the day and he is passing less urine; he feels intermittently light-headed when standing but remains conversational.","reason":"Reduced urine output","channel":"in-person"}},{"date":"2026-08-16T05:50:00Z","kind":"hospital-attendance","service":"hospital","title":"Weakness with reduced urine output","data":{"stage":"arrived","acuity":2,"location":"acute medical unit","arrivalAt":"2026-08-16T05:50:00Z","clinician":"acute medical team","presentingComplaint":"Oliguria, weakness and worsening peripheral oedema"}},{"date":"2026-08-29T13:20:00Z","kind":"discharge-summary","service":"hospital","title":"Acute kidney injury handover","data":{"stage":"sent","sentAt":"2026-08-29T13:20:00Z","sentBy":"Renal medicine team","assignee":"Renal service","sections":{"course":"Presented with reduced urine output and oedema on CKD background; renal function and potassium worsened despite initial treatment.","reason":"Unplanned assessment for possible acute kidney injury and electrolyte disturbance.","results":"Repeat U&E showed marked hyperkalaemia and rising creatinine; ECG monitoring was arranged, with the trigger uncertain.","followUp":"Renal team to repeat electrolytes and review fluid balance; avoid nephrotoxic medicines while cause is clarified.","diagnoses":"Acute kidney injury on CKD with hyperkalaemia was the working assessment; arrhythmia was considered.","gpActions":"Please confirm the latest renal plan, reconcile antihypertensives and check for reduced urine output or palpitations.","medicationChanges":"Potassium-lowering treatment and medication holds were documented; community list requires confirmation."}}}]},{"patientId":"SIM-000417","deathDate":"2026-09-02","deathCause":"Acute respiratory failure from decompensated heart failure","events":[{"date":"2026-05-16T08:15:00Z","kind":"encounter","service":"gp","title":"Orthopnoea and heavier legs","data":{"text":"Breathlessness is more troublesome when lying flat and the reliever inhaler helps only briefly; he has noticed heavier legs over the last month.","reason":"Heart failure and asthma review","channel":"telephone"}},{"date":"2026-05-16T08:25:00Z","kind":"observation","service":"gp","title":"Respiratory status check","data":{"value":"Respiratory rate 20/min; speaking in full sentences; mild bilateral wheeze noted","category":"clinical"}},{"date":"2026-06-30T07:55:00Z","kind":"report","service":"diagnostics","title":"Electrolyte and renal trend","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"collectedAt":"2026-06-30T07:55:00Z","analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":131,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":3.0,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":7.9,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":67,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":31,"referenceLow":60,"referenceHigh":120}]}},{"date":"2026-07-20T08:30:00Z","kind":"report","service":"diagnostics","title":"Inflammatory marker check","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"collectedAt":"2026-07-20T08:30:00Z","analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":16.2,"referenceLow":0,"referenceHigh":5}]}},{"date":"2026-07-28T10:05:00Z","kind":"encounter","service":"gp","title":"Night-time breathlessness","data":{"text":"He now wakes gasping twice a night and needs the inhaler several times daily; family report reduced walking distance and increasing ankle swelling.","reason":"Escalating breathlessness","channel":"telephone"}},{"date":"2026-08-19T21:25:00Z","kind":"hospital-attendance","service":"hospital","title":"Acute breathlessness with fluid overload","data":{"stage":"arrived","acuity":2,"location":"emergency assessment unit","arrivalAt":"2026-08-19T21:25:00Z","clinician":"acute medical team","presentingComplaint":"Orthopnoea, wheeze and increasing bilateral leg oedema"}},{"date":"2026-08-30T11:40:00Z","kind":"discharge-summary","service":"hospital","title":"Cardiorespiratory deterioration handover","data":{"stage":"sent","sentAt":"2026-08-30T11:40:00Z","sentBy":"Acute medicine team","assignee":"Heart failure service","sections":{"course":"Admitted with worsening orthopnoea and wheeze; oxygen and IV diuresis were required, with renal function limiting fluid removal.","reason":"Unplanned admission for acute breathlessness in a patient with heart failure and asthma.","results":"Chest radiograph suggested vascular congestion without definite consolidation; potassium was replaced and repeat renal tests arranged.","followUp":"Heart failure and respiratory nurses to review weight, inhaler use and breathlessness promptly; repeat U&E was requested.","diagnoses":"Acute decompensated heart failure with a possible asthma flare was the working assessment.","gpActions":"Please reconcile inhalers and diuretics, review oxygen or weight concerns and provide out-of-hours advice.","medicationChanges":"IV diuretic treatment and supplemental oxygen were used; outpatient doses awaited specialist reconciliation."}}}]},{"patientId":"SIM-000416","deathDate":"2026-09-04","deathCause":"Intracerebral haemorrhage","events":[{"date":"2026-05-18T08:35:00Z","kind":"encounter","service":"gp","title":"Slower walking and light-headedness","data":{"text":"He is slower on his usual walks and has occasional light-headedness; no focal weakness, speech change or severe headache is reported today.","reason":"Blood pressure review","channel":"telephone"}},{"date":"2026-07-01T08:10:00Z","kind":"report","service":"diagnostics","title":"Renal and electrolyte assessment","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"collectedAt":"2026-07-01T08:10:00Z","analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":150,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":4.6,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":8.4,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":160,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":42,"referenceLow":60,"referenceHigh":120}]}},{"date":"2026-07-30T09:15:00Z","kind":"encounter","service":"gp","title":"Headache and raised readings","data":{"text":"Blood pressure readings are higher than usual and he describes an intermittent headache; urgent help was advised for weakness or speech difficulty.","reason":"Blood pressure and headache review","channel":"in-person"}},{"date":"2026-08-20T07:05:00Z","kind":"hospital-attendance","service":"hospital","title":"Sudden neurological change","data":{"stage":"arrived","acuity":1,"location":"emergency department","arrivalAt":"2026-08-20T07:05:00Z","clinician":"stroke medical team","presentingComplaint":"Acute right-sided weakness and dysarthria"}},{"date":"2026-09-03T12:25:00Z","kind":"discharge-summary","service":"hospital","title":"Neurology deterioration handover","data":{"stage":"sent","sentAt":"2026-09-03T12:25:00Z","sentBy":"Stroke service","assignee":"Neurology team","sections":{"course":"Presented with sudden right-sided weakness and dysarthria; CT was consistent with an intracerebral bleed, and blood pressure was treated.","reason":"Emergency admission for acute neurological deficit.","results":"Initial imaging showed an acute left intracerebral haemorrhage; neurosurgical advice was sought and monitoring continued.","followUp":"Stroke team to guide rehabilitation and swallowing review; family to receive an updated plan as the course becomes clearer.","diagnoses":"Intracerebral haemorrhage was documented on imaging; the extent of recovery was not yet assessed at handover.","gpActions":"Please avoid assumptions about recovery, confirm the specialist plan and check antihypertensive changes.","medicationChanges":"Blood pressure treatment was reviewed in hospital; the discharge medication list was not final at correspondence."}}}]},{"patientId":"SIM-000395","deathDate":"2026-09-07","deathCause":"Acute-on-chronic kidney failure","events":[{"date":"2026-05-21T08:15:00Z","kind":"encounter","service":"gp","title":"Poor appetite and oedema","data":{"text":"She has less appetite and increasing fatigue, with intermittent nausea; ankle swelling appears by evening and her usual shoes feel tight.","reason":"Chronic kidney disease review","channel":"telephone"}},{"date":"2026-05-21T08:25:00Z","kind":"observation","service":"gp","title":"Weight and nutritional change","data":{"value":"Weight 68.1 kg; reports approximately 1.5 kg unintentional loss since winter","category":"clinical"}},{"date":"2026-06-24T07:40:00Z","kind":"report","service":"diagnostics","title":"Declining renal function","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"collectedAt":"2026-06-24T07:40:00Z","analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":136,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":4.8,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":13.0,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":120,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":28,"referenceLow":60,"referenceHigh":120}]}},{"date":"2026-07-17T09:50:00Z","kind":"encounter","service":"gp","title":"Reduced intake and urine output","data":{"text":"Nausea is now affecting meals and she is much less active; urine output seems reduced and swelling has spread above the ankles.","reason":"Possible renal deterioration","channel":"telephone"}},{"date":"2026-08-11T18:20:00Z","kind":"hospital-attendance","service":"hospital","title":"Uraemic symptoms and fluid retention","data":{"stage":"arrived","acuity":2,"location":"acute medical unit","arrivalAt":"2026-08-11T18:20:00Z","clinician":"renal medical team","presentingComplaint":"Poor intake, reduced urine output, nausea and worsening oedema"}},{"date":"2026-08-27T10:45:00Z","kind":"discharge-summary","service":"hospital","title":"Renal decline handover","data":{"stage":"sent","sentAt":"2026-08-27T10:45:00Z","sentBy":"Renal medicine team","assignee":"Renal service","sections":{"course":"Admitted with poor intake, oliguria and worsening oedema on CKD background; renal function deteriorated despite cautious management.","reason":"Unplanned renal assessment for suspected acute-on-chronic kidney injury.","results":"Urea and creatinine rose from baseline; ultrasound showed no clear obstruction, and the precipitating cause remained under review.","followUp":"Renal team to discuss monitoring and treatment options with the patient and family; repeat tests if consistent with goals.","diagnoses":"Acute-on-chronic kidney failure was the working diagnosis, with heart failure complicating fluid management.","gpActions":"Please confirm the renal plan, check symptom control and avoid medicines that may worsen kidney function unless advised.","medicationChanges":"Diuretic and renal-risk medicines were reviewed in hospital; the community list needs reconciliation."}}}]},{"patientId":"SIM-000391","deathDate":"2026-09-08","deathCause":"Acute myocardial infarction","events":[{"date":"2026-05-24T08:15:00Z","kind":"encounter","service":"gp","title":"Exertional chest pressure","data":{"text":"He reports brief central pressure after walking uphill and more fatigue; symptoms settle with rest and have not occurred at rest.","reason":"Cardiac symptom review","channel":"telephone"}},{"date":"2026-05-24T08:25:00Z","kind":"observation","service":"gp","title":"Pulse and blood pressure check","data":{"value":"Pulse 88 bpm and regular; blood pressure 146/82 mmHg; no pain during review","category":"clinical"}},{"date":"2026-06-27T08:20:00Z","kind":"report","service":"diagnostics","title":"Anaemia and platelet check","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"collectedAt":"2026-06-27T08:20:00Z","analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":108,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":8.9,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":130,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":84.9,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":5.2,"referenceLow":2,"referenceHigh":7.5}]}},{"date":"2026-07-16T08:40:00Z","kind":"report","service":"diagnostics","title":"Inflammation check during fatigue","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"collectedAt":"2026-07-16T08:40:00Z","analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":7.8,"referenceLow":0,"referenceHigh":5}]}},{"date":"2026-07-22T09:05:00Z","kind":"encounter","service":"gp","title":"Shorter-walk chest episodes","data":{"text":"He now gets chest pressure after a few steps with breathlessness, and the latest episode lasted longer than usual; urgent assessment was advised.","reason":"Changing exertional chest pain","channel":"in-person"}},{"date":"2026-08-14T18:55:00Z","kind":"hospital-attendance","service":"hospital","title":"Prolonged chest pain and breathlessness","data":{"stage":"arrived","acuity":1,"location":"emergency department","arrivalAt":"2026-08-14T18:55:00Z","clinician":"cardiology and emergency teams","presentingComplaint":"Chest pressure at rest with diaphoresis and shortness of breath"}},{"date":"2026-09-01T10:15:00Z","kind":"discharge-summary","service":"hospital","title":"Acute coronary syndrome handover","data":{"stage":"sent","sentAt":"2026-09-01T10:15:00Z","sentBy":"Cardiology team","assignee":"Coronary care service","sections":{"course":"Presented with prolonged chest pressure and breathlessness; ECG and serial troponin supported acute coronary syndrome, with heart failure noted.","reason":"Emergency admission for changing exertional chest pain with diabetes and heart failure.","results":"Troponin rose on repeat testing and ECG changes were recorded; cardiology review was requested, with intervention pending.","followUp":"Cardiology and heart failure teams to review treatment and function; seek help for pain or breathlessness.","diagnoses":"Acute myocardial infarction was the working diagnosis after chest pain and biomarker change; specialist review pending.","gpActions":"Please reconcile antiplatelet and cardiac medicines against the hospital list before repeat prescribing.","medicationChanges":"Cardiac medicines were adjusted in hospital; the continuing combination needed specialist confirmation."}}}]},{"patientId":"SIM-000378","deathDate":"2026-09-10","deathCause":"Pneumonia causing respiratory failure","events":[{"date":"2026-05-27T08:45:00Z","kind":"encounter","service":"gp","title":"New cough and wheeze","data":{"text":"She has developed a productive cough and wheeze after several days of reduced exercise tolerance; no trigger or high fever has been reported.","reason":"Respiratory symptom review","channel":"telephone"}},{"date":"2026-06-28T07:35:00Z","kind":"report","service":"diagnostics","title":"Neutrophil response to respiratory symptoms","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"collectedAt":"2026-06-28T07:35:00Z","analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":133,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":13.6,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":210,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":90.1,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":10.2,"referenceLow":2,"referenceHigh":7.5}]}},{"date":"2026-07-27T09:25:00Z","kind":"encounter","service":"gp","title":"Worsening productive cough","data":{"text":"The cough is now frequent with yellow sputum and she becomes breathless dressing; salbutamol gives only brief relief and appetite is poor.","reason":"Worsening cough and breathlessness","channel":"in-person"}},{"date":"2026-08-17T20:05:00Z","kind":"hospital-attendance","service":"hospital","title":"Worsening cough and oxygen requirement","data":{"stage":"arrived","acuity":2,"location":"acute medical unit","arrivalAt":"2026-08-17T20:05:00Z","clinician":"respiratory medical team","presentingComplaint":"Productive cough, wheeze and breathlessness with low oxygen saturation"}},{"date":"2026-09-06T15:20:00Z","kind":"discharge-summary","service":"hospital","title":"Respiratory infection handover","data":{"stage":"sent","sentAt":"2026-09-06T15:20:00Z","sentBy":"Respiratory team","assignee":"Acute respiratory service","sections":{"course":"Admitted with progressive cough, wheeze and hypoxia; bronchodilators, oxygen and antibiotics were given, with fluctuating effort.","reason":"Unplanned assessment for lower respiratory infection in a patient with asthma.","results":"Chest imaging showed patchy basal change; inflammatory markers were raised, though no pathogen was confirmed.","followUp":"Respiratory team to review oxygen need and inhaler technique; family advised to seek help for increasing work of breathing.","diagnoses":"Pneumonia with respiratory failure was considered; the contribution of asthma remained under review.","gpActions":"Please check inhaler supply, oxygen plan and antibiotic reconciliation, and confirm respiratory follow-up.","medicationChanges":"Nebulised bronchodilators, oxygen and antimicrobial treatment were used; the outpatient regimen required confirmation."}}}]},{"patientId":"SIM-000371","deathDate":"2026-09-11","deathCause":"Ischaemic stroke","events":[{"date":"2026-05-30T08:15:00Z","kind":"encounter","service":"gp","title":"Sleepiness and reduced function","data":{"text":"His family notice increasing daytime sleep and breathlessness on short walks; he manages medicines but needs more help with meals and household tasks.","reason":"Function and heart failure review","channel":"telephone"}},{"date":"2026-05-30T08:25:00Z","kind":"observation","service":"gp","title":"Weight and oedema observation","data":{"value":"Weight 74.6 kg; mild sacral oedema and reduced appetite noted by family","category":"clinical"}},{"date":"2026-06-25T07:25:00Z","kind":"report","service":"diagnostics","title":"Renal decline and hyponatraemia","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"collectedAt":"2026-06-25T07:25:00Z","analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":131,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":4.7,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":12.8,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":190,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":29,"referenceLow":60,"referenceHigh":120}]}},{"date":"2026-07-21T08:55:00Z","kind":"report","service":"diagnostics","title":"Inflammation review during decline","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"collectedAt":"2026-07-21T08:55:00Z","analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":11.4,"referenceLow":0,"referenceHigh":5}]}},{"date":"2026-07-25T10:15:00Z","kind":"encounter","service":"gp","title":"Unsteadiness and transient dysphasia","data":{"text":"He is unsteady and intermittently muddled, with a brief episode of slurred speech that resolved before review; urgent assessment was discussed.","reason":"New neurological symptoms","channel":"in-person"}},{"date":"2026-08-13T05:45:00Z","kind":"hospital-attendance","service":"hospital","title":"Transient weakness and speech disturbance","data":{"stage":"arrived","acuity":1,"location":"stroke receiving unit","arrivalAt":"2026-08-13T05:45:00Z","clinician":"stroke medical team","presentingComplaint":"Sudden facial asymmetry, left arm weakness and dysarthria"}},{"date":"2026-09-09T09:30:00Z","kind":"discharge-summary","service":"hospital","title":"Stroke assessment handover","data":{"stage":"sent","sentAt":"2026-09-09T09:30:00Z","sentBy":"Stroke service","assignee":"Stroke and rehabilitation team","sections":{"course":"Presented after facial asymmetry, left arm weakness and dysarthria; imaging supported acute ischaemic stroke, with renal and heart failure complicating care.","reason":"Emergency admission for new focal neurological symptoms.","results":"Brain imaging showed an acute right-sided infarct without haemorrhage; swallowing and mobility assessments were requested.","followUp":"Stroke and rehabilitation teams to review function, nutrition and safe discharge arrangements; a family meeting was planned.","diagnoses":"Ischaemic stroke was documented initially; residual deficit and recovery potential remained uncertain.","gpActions":"Please confirm the swallowing plan, reconcile vascular medicines and coordinate follow-up with stroke services.","medicationChanges":"Antithrombotic and cardiovascular treatment was reviewed after imaging; the plan was left to the stroke team."}}}]},{"patientId":"SIM-000349","deathDate":"2026-09-17","deathCause":"Acute decompensated heart failure with pulmonary oedema","events":[{"date":"2026-05-29","kind":"encounter","service":"gp","title":"Early fluid retention review","data":{"reason":"Heart failure review","channel":"telephone"},"text":"She reports two weeks of ankle swelling and needing an extra pillow at night, without breathlessness at rest. Review arranged."},{"date":"2026-06-19","kind":"report","service":"diagnostics","title":"Urea and electrolyte trend","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":133,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":4.3,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":7.1,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":96,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":61,"referenceLow":60,"referenceHigh":120}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-19T08:00:00Z"},"text":"eGFR had fallen to 61 with borderline sodium and rising urea, prompting closer fluid and renal review."},{"date":"2026-07-23","kind":"encounter","service":"gp","title":"Worsening exertional breathlessness","data":{"reason":"Heart failure symptom review","channel":"in-person"},"text":"Breathlessness now limits the walk to the local shop; ankle swelling persists. She denies chest pain and will attend an in-person assessment."},{"date":"2026-08-18","kind":"observation","service":"gp","title":"Home oxygen and weight check","data":{"value":"Weight 79.4 kg; oxygen saturation 92% on room air; bilateral ankle oedema noted.","category":"clinical assessment"},"text":"At home, weight had increased and oxygen saturation was 92% on air; bilateral ankle oedema was documented."},{"date":"2026-09-13","kind":"hospital-attendance","service":"hospital","title":"Breathlessness with oedema","data":{"stage":"triaged","acuity":"2","location":"Acute medical unit","arrivalAt":"2026-09-13T07:40:00Z","clinician":"Acute medical team","presentingComplaint":"Progressive dyspnoea, orthopnoea and bilateral leg swelling"},"text":"Presented with worsening orthopnoea and oedema; saturation was 86% on air and IV diuresis was started for pulmonary congestion."},{"date":"2026-09-14","kind":"discharge-summary","service":"hospital","title":"Acute heart failure medical handover","data":{"stage":"sent","sentAt":"2026-09-14T15:00:00Z","sentBy":"Acute medical registrar","assignee":"Duty GP","sections":{"course":"Admitted with escalating orthopnoea and peripheral oedema; examination was consistent with pulmonary congestion and IV diuresis was started.","reason":"Urgent admission for suspected acute-on-chronic heart failure with increasing oxygen requirement.","results":"Chest imaging was reported as pulmonary vascular congestion; renal function was monitored during diuresis.","followUp":"Continue inpatient cardiology review and reassess oxygen need, fluid balance and kidney function.","diagnoses":"Working diagnosis was acute decompensated heart failure; no alternate acute diagnosis was confirmed in the handover.","gpActions":"Please reconcile recent medicines and review renal results when the hospital outcome is received.","medicationChanges":"Loop diuretic treatment was adjusted in hospital; the final discharge list was not yet available."}},"text":"Admitted with escalating orthopnoea and peripheral oedema; examination was consistent with pulmonary congestion and IV diuresis was started."},{"date":"2026-09-15","kind":"hospital-note","service":"hospital","title":"Refractory cardiac congestion","text":"Breathlessness returned with falling urine output and cool peripheries despite further diuresis; the cardiac team discussed the limited response with family.","data":{"bloodPressure":"90/56","oxygenSaturation":84,"urineOutput":"falling","treatment":"intravenous diuresis","assessment":"suspected low-output cardiac failure"}}]},{"patientId":"SIM-000348","deathDate":"2026-09-20","deathCause":"Status asthmaticus with acute hypoxic respiratory failure","events":[{"date":"2026-05-31","kind":"encounter","service":"gp","title":"Intermittent wheeze review","data":{"reason":"Asthma review","channel":"telephone"},"text":"She mentions an occasional wheeze on climbing the stairs but is comfortable at rest and has not needed extra reliever doses."},{"date":"2026-06-28","kind":"report","service":"diagnostics","title":"Persistent leukopenia check","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":143,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":1.6,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":315,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":82,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":1.2,"referenceLow":2,"referenceHigh":7.5}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-28T08:00:00Z"},"text":"White-cell and neutrophil counts remain low on repeat FBC; infection precautions and repeat review were advised."},{"date":"2026-07-29","kind":"encounter","service":"gp","title":"Night-time wheeze and cough","data":{"reason":"Respiratory symptom review","channel":"in-person"},"text":"Night-time wheeze and a dry cough have become more frequent over the past week; reliever use is now most evenings."},{"date":"2026-09-16","kind":"hospital-attendance","service":"hospital","title":"Acute wheeze and hypoxia","data":{"stage":"triaged","acuity":"2","location":"Emergency assessment unit","arrivalAt":"2026-09-16T18:20:00Z","clinician":"Emergency medical team","presentingComplaint":"Worsening wheeze and breathlessness despite reliever inhaler"},"text":"Arrived with severe wheeze and inability to complete sentences; saturation was 84% on air despite repeated reliever use."},{"date":"2026-09-17","kind":"observation","service":"hospital","title":"Oxygen saturation after nebulisers","data":{"value":"SpO2 88% on room air; 94% on 4 L/min nasal oxygen after nebulised treatment.","category":"acute respiratory observation"},"text":"After nebulisers, saturation improved only to 94% on 4 L/min oxygen; room-air saturation was 88%."},{"date":"2026-09-18","kind":"discharge-summary","service":"hospital","title":"Respiratory acute asthma handover","data":{"stage":"sent","sentAt":"2026-09-18T13:30:00Z","sentBy":"Respiratory registrar","assignee":"Practice document team","sections":{"course":"Presented with rapidly worsening wheeze and increased work of breathing; repeated bronchodilator treatment and oxygen were required.","reason":"Emergency attendance for severe asthma exacerbation with persistent hypoxaemia.","results":"Chest examination remained tight; a chest radiograph did not show focal collapse in the initial report.","followUp":"Continue close respiratory monitoring and escalate ventilatory support if gas exchange worsens.","diagnoses":"The working diagnosis was life-threatening asthma exacerbation; infection was considered because of persistent inflammatory markers.","gpActions":"Review inhaler technique and recent prescribing history if the admission outcome is returned.","medicationChanges":"Nebulised bronchodilators and systemic corticosteroid treatment were given in hospital; final medicines were pending."}},"text":"Presented with rapidly worsening wheeze and increased work of breathing; repeated bronchodilator treatment and oxygen were required."},{"date":"2026-09-18","kind":"hospital-note","service":"hospital","title":"Refractory ventilatory failure","text":"Respiratory effort worsened despite continuous bronchodilators and non-invasive support; blood gases showed rising carbon dioxide and the response remained limited.","data":{"support":"continuous bronchodilators and non-invasive ventilation","bloodGas":"rising carbon dioxide","oxygenSaturation":82,"response":"poor","familyDiscussion":true}}]},{"patientId":"SIM-000333","deathDate":"2026-09-23","deathCause":"Community-acquired pneumonia with acute respiratory failure","events":[{"date":"2026-06-02","kind":"encounter","service":"gp","title":"Lingering cough review","data":{"reason":"New cough review","channel":"telephone"},"text":"A mild cough has lingered for several days with reduced appetite; no fever or breathlessness at rest was reported during the call."},{"date":"2026-07-31","kind":"report","service":"diagnostics","title":"Rising inflammatory marker","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":21.6,"referenceLow":0,"referenceHigh":5}],"laboratory":"Riverside Pathology","collectedAt":"2026-07-31T08:00:00Z"},"text":"CRP rose to 21.6 mg/L, supporting a new inflammatory change alongside the persistent respiratory symptoms."},{"date":"2026-08-11","kind":"encounter","service":"gp","title":"Productive cough and fatigue","data":{"reason":"Respiratory infection review","channel":"in-person"},"text":"The cough is now productive with increasing fatigue and breathlessness on short walks; urgent review was advised if breathing worsens."},{"date":"2026-09-19","kind":"hospital-attendance","service":"hospital","title":"Fever and hypoxic breathlessness","data":{"stage":"triaged","acuity":"2","location":"Acute medical unit","arrivalAt":"2026-09-19T11:10:00Z","clinician":"Acute medical team","presentingComplaint":"Productive cough, fever and increasing breathlessness"},"text":"Presented with fever, productive cough and increasing work of breathing; oxygen was required and imaging suggested basal infection."},{"date":"2026-09-19","kind":"observation","service":"hospital","title":"Oxygen requirement on admission","data":{"value":"SpO2 86% on room air; 93% on 4 L/min nasal oxygen with respiratory rate 28/min.","category":"acute respiratory observation"},"text":"Oxygen saturation was 86% on air and 93% on 4 L/min; respiratory rate remained 28/min."},{"date":"2026-09-20","kind":"discharge-summary","service":"hospital","title":"Respiratory pneumonia transfer note","data":{"stage":"sent","sentAt":"2026-09-20T10:20:00Z","sentBy":"Acute medical registrar","assignee":"Duty GP","sections":{"course":"Admitted with fever, productive cough and increasing oxygen requirement; intravenous antimicrobials and oxygen therapy were started.","reason":"Emergency attendance for suspected lower respiratory infection with hypoxaemia.","results":"Chest imaging showed a new basal air-space change; blood cultures were pending at the time of handover.","followUp":"Maintain respiratory observations and reassess oxygen requirement, hydration and response to treatment.","diagnoses":"Working diagnosis was community-acquired pneumonia with acute respiratory compromise; the source remained under review.","gpActions":"Reconcile recent cardiopulmonary history when the hospital outcome is returned and review any culture result.","medicationChanges":"Intravenous antimicrobial treatment and oxygen were commenced; the final antimicrobial plan was not yet recorded."}},"text":"Admitted with fever, productive cough and increasing oxygen requirement; intravenous antimicrobials and oxygen therapy were started."},{"date":"2026-09-21","kind":"hospital-attendance","service":"hospital","title":"Re-presentation with refractory hypoxaemia","text":"Returned drowsy with severe breathlessness despite treatment; saturations stayed low on high-flow oxygen and escalation was reviewed with family.","data":{"presentingComplaint":"Worsening hypoxaemia during pneumonia recovery","acuity":"critical","oxygenSaturation":82,"support":"high-flow oxygen","familyDiscussion":true}}]},{"patientId":"SIM-000327","deathDate":"2026-09-25","deathCause":"Hyperosmolar hyperglycaemic state with acute kidney injury","events":[{"date":"2026-06-04","kind":"encounter","service":"gp","title":"Thirst and nocturia review","data":{"reason":"Diabetes review","channel":"telephone"},"text":"Increased thirst and nocturia were mentioned at review, but he remained eating and drinking normally and had no acute symptoms."},{"date":"2026-06-30","kind":"report","service":"diagnostics","title":"Diabetes marker follow-up","data":{"kind":"blood-result","panel":{"id":"hba1c","name":"HbA1c"},"analytes":[{"id":"hba1c","name":"HbA1c","unit":"mmol/mol","value":56,"referenceLow":20,"referenceHigh":41}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-30T08:00:00Z"},"text":"HbA1c rose to 56 mmol/mol, supporting the reported thirst and prompting an earlier diabetes review."},{"date":"2026-07-27","kind":"encounter","service":"gp","title":"Dizziness and persistent thirst","data":{"reason":"Diabetes symptom review","channel":"telephone"},"text":"Persistent thirst with new daytime fatigue and occasional dizziness on standing were reported; a prompt diabetes review and hydration advice were given."},{"date":"2026-09-22","kind":"hospital-attendance","service":"hospital","title":"Confusion and marked thirst","data":{"stage":"triaged","acuity":"2","location":"Emergency assessment unit","arrivalAt":"2026-09-22T16:50:00Z","clinician":"Emergency medical team","presentingComplaint":"Progressive lethargy, polyuria and new confusion"},"text":"Presented drowsy and dehydrated with glucose 38.6 mmol/L and calculated osmolality 329; fluids and insulin were commenced."},{"date":"2026-09-22","kind":"observation","service":"hospital","title":"Acute glucose assessment","data":{"value":"Capillary glucose 31.4 mmol/L; blood pressure 92/58 mmHg with dry mucous membranes.","category":"acute metabolic assessment"},"text":"Capillary glucose was 31.4 mmol/L with low blood pressure and clinical dehydration."},{"date":"2026-09-23","kind":"discharge-summary","service":"hospital","title":"Acute hyperglycaemia medical handover","data":{"stage":"sent","sentAt":"2026-09-23T14:10:00Z","sentBy":"Acute medical registrar","assignee":"Practice document team","sections":{"course":"Presented with marked thirst, lethargy and confusion; intravenous fluid replacement and insulin treatment were commenced with close electrolyte monitoring.","reason":"Emergency admission for severe hyperglycaemia and clinical dehydration.","results":"Initial blood testing showed significant hyperglycaemia with an acute rise in renal markers; serial electrolytes were requested.","followUp":"Continue inpatient glucose, fluid balance and renal monitoring until mental state and oral intake improve.","diagnoses":"Working diagnosis was hyperosmolar hyperglycaemic state with acute kidney injury; precipitating factors were still being assessed.","gpActions":"Review recent repeat prescriptions and diabetes follow-up once the hospital course is available.","medicationChanges":"Insulin and intravenous fluids were prescribed during admission; the longer-term diabetes regimen was not yet finalised."}},"text":"Presented with marked thirst, lethargy and confusion; intravenous fluid replacement and insulin treatment were commenced with close electrolyte monitoring."},{"date":"2026-09-23","kind":"hospital-note","service":"hospital","title":"Persistent hyperosmolar state","text":"Mental state improved only briefly; sodium remained abnormal and oral intake was poor. The team documented a guarded response while continuing treatment.","data":{"glucose":31.4,"sodium":128,"oralIntake":"poor","assessment":"ongoing hyperosmolar physiology","outlook":"guarded"}}]},{"patientId":"SIM-000304","deathDate":"2026-09-27","deathCause":"Hypertensive intracerebral haemorrhage","events":[{"date":"2026-05-26","kind":"encounter","service":"gp","title":"Higher home blood pressure readings","data":{"reason":"Hypertension review","channel":"telephone"},"text":"Home readings have been higher than usual and she reports intermittent morning headache; no focal weakness or speech change was noted at review."},{"date":"2026-06-17","kind":"report","service":"diagnostics","title":"Renal function monitoring","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":132,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":4.1,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":8.4,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":109,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":92,"referenceLow":60,"referenceHigh":120}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-17T08:00:00Z"},"text":"Urea was above range with eGFR near the lower limit; renal monitoring was continued while blood pressure was reviewed."},{"date":"2026-08-19","kind":"encounter","service":"gp","title":"Transient language difficulty","data":{"reason":"New neurological symptoms","channel":"in-person"},"text":"Family describes two episodes of word-finding difficulty and increasing drowsiness; urgent assessment was advised rather than routine follow-up."},{"date":"2026-09-24","kind":"hospital-attendance","service":"hospital","title":"Sudden weakness and dysphasia","data":{"stage":"triaged","acuity":"1","location":"Resuscitation area","arrivalAt":"2026-09-24T09:15:00Z","clinician":"Stroke team","presentingComplaint":"Acute right-sided weakness with altered speech"},"text":"Sudden right-sided weakness and dysphasia prompted stroke activation; initial blood pressure was 218/110 mmHg."},{"date":"2026-09-25","kind":"observation","service":"hospital","title":"Acute neurological observations","data":{"value":"Blood pressure 214/108 mmHg; Glasgow Coma Scale 11/15 with persistent dysphasia.","category":"acute neurological assessment"},"text":"Blood pressure was 214/108 mmHg and GCS was 11/15 with persistent dysphasia."},{"date":"2026-09-26","kind":"discharge-summary","service":"hospital","title":"Stroke acute neurology handover","data":{"stage":"sent","sentAt":"2026-09-26T12:40:00Z","sentBy":"Stroke registrar","assignee":"Duty GP","sections":{"course":"Presented with sudden focal weakness and dysphasia in the setting of markedly elevated blood pressure; stroke pathway assessment and blood pressure control were initiated.","reason":"Emergency admission for acute neurological deficit with concern for intracranial bleeding.","results":"Initial head imaging was reviewed by the stroke team; repeat imaging and neurological observations remained planned.","followUp":"Continue stroke-unit monitoring, repeat imaging as indicated and assess swallowing before oral medication.","diagnoses":"Working diagnosis was hypertensive intracerebral haemorrhage; the full radiology interpretation was still being reviewed.","gpActions":"Reconcile antihypertensive treatment and forward the current renal history to the receiving stroke team.","medicationChanges":"Blood pressure treatment was adjusted acutely; antithrombotic decisions were deferred to the stroke service."}},"text":"Presented with focal weakness and dysphasia with markedly elevated blood pressure; stroke-pathway assessment and blood-pressure control were initiated."},{"date":"2026-09-26","kind":"hospital-note","service":"hospital","title":"Neurological deterioration after haemorrhage","text":"Consciousness worsened with persistent hypertension and swallowing difficulty. The stroke team recorded a guarded outlook and discussed support with family.","data":{"bloodPressure":"198/104","glasgowComaScale":8,"swallow":"unsafe","assessment":"progressive intracerebral haemorrhage","familyDiscussion":true}}]},{"patientId":"SIM-000294","deathDate":"2026-09-30","deathCause":"Aspiration pneumonia with acute-on-chronic heart failure","events":[{"date":"2026-05-27","kind":"encounter","service":"gp","title":"Breathlessness after meals","data":{"reason":"Breathlessness review","channel":"telephone"},"text":"Increasing fatigue and occasional breathlessness after meals were reported; there was no fever, chest pain or rest dyspnoea and appetite was unchanged."},{"date":"2026-07-21","kind":"report","service":"diagnostics","title":"Inflammatory marker follow-up","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":15.2,"referenceLow":0,"referenceHigh":5}],"laboratory":"Riverside Pathology","collectedAt":"2026-07-21T08:00:00Z"},"text":"CRP was 15.2 mg/L, higher than the previous mild elevation and requiring clinical correlation."},{"date":"2026-08-01","kind":"encounter","service":"gp","title":"Cough with swallowing difficulty","data":{"reason":"Swallowing and respiratory review","channel":"in-person"},"text":"A new cough while drinking and two choking episodes were reported by family; breathlessness is worse at night and prompt review was arranged."},{"date":"2026-09-27","kind":"hospital-attendance","service":"hospital","title":"Cough, fever and desaturation","data":{"stage":"triaged","acuity":"2","location":"Acute medical unit","arrivalAt":"2026-09-27T10:35:00Z","clinician":"Acute medical team","presentingComplaint":"Possible aspiration with worsening breathlessness and fever"},"text":"Presented febrile and hypoxic after a witnessed aspiration; dependent lower-lobe change and fluid overload were suspected."},{"date":"2026-09-28","kind":"discharge-summary","service":"hospital","title":"Respiratory and cardiac handover","data":{"stage":"sent","sentAt":"2026-09-28T16:15:00Z","sentBy":"Acute medical registrar","assignee":"Practice document team","sections":{"course":"Admitted with hypoxia after a witnessed aspiration event; oxygen, intravenous antimicrobials and treatment for fluid overload were started.","reason":"Emergency attendance for suspected aspiration pneumonia with acute worsening of chronic cardiac symptoms.","results":"Chest imaging showed dependent air-space change and vascular congestion; renal function and fluid balance required close review.","followUp":"Continue respiratory and cardiac observations, review swallowing safety and adjust diuretic treatment against renal results.","diagnoses":"Working diagnosis was aspiration pneumonia with acute-on-chronic heart failure; the aspiration history was obtained from family.","gpActions":"Please send the current heart failure and inhaler history with any transfer information.","medicationChanges":"Antimicrobial and diuretic treatment was commenced in hospital; the final medicines reconciliation was pending."}},"text":"Admitted with hypoxia after a witnessed aspiration event; oxygen, intravenous antimicrobials and treatment for fluid overload were started."},{"date":"2026-09-29","kind":"hospital-note","service":"hospital","title":"Septic respiratory deterioration","text":"Oxygen requirement and work of breathing increased after aspiration pneumonia treatment; hypotension and reduced urine output prompted a renewed sepsis review.","data":{"oxygenSaturation":81,"bloodPressure":"82/50","urineOutput":"reduced","assessment":"worsening aspiration pneumonia with shock","familyDiscussion":true}}]},{"patientId":"SIM-000292","deathDate":"2026-10-02","deathCause":"Urosepsis with acute kidney injury","events":[{"date":"2026-05-30","kind":"encounter","service":"gp","title":"Reduced appetite and ankle swelling","data":{"reason":"Chronic kidney disease review","channel":"in-person"},"text":"Mild ankle swelling and reduced appetite were noted at routine review; no dysuria, fever or breathlessness was reported at that time."},{"date":"2026-06-21","kind":"report","service":"diagnostics","title":"Electrolyte and renal deterioration","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":129,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.7,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":10.2,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":96,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":58,"referenceLow":60,"referenceHigh":120}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-21T08:00:00Z"},"text":"Sodium and eGFR were low with potassium and urea raised; the practice requested prompt renal follow-up."},{"date":"2026-07-18","kind":"encounter","service":"gp","title":"New urinary symptoms","data":{"reason":"Urinary symptoms","channel":"telephone"},"text":"Increasing urinary frequency and burning with intermittent chills were reported; same-day urine assessment was advised, with help requested for fever or flank pain."},{"date":"2026-08-06","kind":"report","service":"diagnostics","title":"Acute inflammatory response","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":18.6,"referenceLow":0,"referenceHigh":5}],"laboratory":"Riverside Pathology","collectedAt":"2026-08-06T08:00:00Z"},"text":"CRP rose to 18.6 mg/L alongside the earlier electrolyte and renal abnormalities, increasing concern for an intercurrent infection."},{"date":"2026-09-30","kind":"hospital-attendance","service":"hospital","title":"Fever, flank pain and confusion","data":{"stage":"triaged","acuity":"2","location":"Emergency assessment unit","arrivalAt":"2026-09-30T04:50:00Z","clinician":"Emergency medical team","presentingComplaint":"Dysuria with fever, flank pain and new confusion"},"text":"Presented with fever, flank pain and confusion in the setting of urinary symptoms; fluids and IV antibiotics were started."},{"date":"2026-10-01","kind":"discharge-summary","service":"hospital","title":"Acute infection and renal handover","data":{"stage":"sent","sentAt":"2026-10-01T11:25:00Z","sentBy":"Acute medical registrar","assignee":"Duty GP","sections":{"course":"Presented with fever, urinary symptoms and confusion; intravenous fluids and antimicrobial treatment were started while renal function was monitored.","reason":"Emergency admission for suspected urinary infection with systemic illness and reduced kidney function.","results":"Initial testing supported infection with an acute change in renal markers; urine culture and sensitivities were pending.","followUp":"Continue observations, fluid balance and renal profile monitoring, with antimicrobial review when culture results return.","diagnoses":"Working diagnosis was urosepsis with acute kidney injury in the context of chronic kidney disease.","gpActions":"Forward the current asthma and diabetes medicines list and review the culture result when available.","medicationChanges":"Intravenous antimicrobials and fluid replacement were commenced; renal dosing review remained required."}},"text":"Presented with fever, urinary symptoms and confusion; intravenous fluids and antimicrobial treatment were started while renal function was monitored."},{"date":"2026-10-01","kind":"hospital-note","service":"hospital","title":"Persistent infection and kidney injury","text":"Fever and confusion persisted despite antimicrobial treatment, with poor intake and renal function failing to return to baseline. Further escalation was reviewed.","data":{"temperatureC":39.1,"creatinine":214,"urineOutput":"oliguria","assessment":"ongoing urosepsis with acute kidney injury","familyDiscussion":true}}]},{"patientId":"SIM-000284","deathDate":"2026-10-05","deathCause":"Acute myocardial infarction with cardiogenic shock","events":[{"date":"2026-05-28","kind":"encounter","service":"gp","title":"Reduced exercise tolerance","data":{"reason":"Cardiac symptom review","channel":"telephone"},"text":"She has noticed reduced exercise tolerance and occasional chest pressure when hurrying, resolving after rest; no pain was present during the consultation."},{"date":"2026-05-28","kind":"observation","service":"gp","title":"Cardiovascular observations","data":{"value":"Pulse 96 bpm; blood pressure 148/86 mmHg; no resting chest pain recorded.","category":"clinical assessment"},"text":"At review, pulse was 96 bpm and blood pressure 148/86 mmHg; no resting chest pain was recorded."},{"date":"2026-06-24","kind":"report","service":"diagnostics","title":"Macrocytosis and white-cell review","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":143,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":2.8,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":300,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":101.4,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":1.8,"referenceLow":2,"referenceHigh":7.5}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-24T08:00:00Z"},"text":"White-cell count and neutrophils were below range with persistent macrocytosis; repeat assessment was advised."},{"date":"2026-08-02","kind":"encounter","service":"gp","title":"Exertional chest pressure","data":{"reason":"Chest pain review","channel":"telephone"},"text":"Chest pressure now occurs after shorter walks and is accompanied by sweating; immediate assessment was advised if the pain returned or lasted longer."},{"date":"2026-10-02","kind":"hospital-attendance","service":"hospital","title":"Prolonged chest pain and hypotension","data":{"stage":"triaged","acuity":"1","location":"Coronary care area","arrivalAt":"2026-10-02T14:05:00Z","clinician":"Cardiology team","presentingComplaint":"Prolonged central chest pain with diaphoresis and breathlessness"},"text":"Arrived with prolonged central chest pain, hypotension and breathlessness; ECG and cardiac markers were urgently assessed."},{"date":"2026-10-02","kind":"observation","service":"hospital","title":"Acute cardiac observations","data":{"value":"Blood pressure 86/54 mmHg; pulse 118 bpm; oxygen saturation 91% on room air with cool peripheries.","category":"acute cardiac assessment"},"text":"Blood pressure was 86/54 mmHg with tachycardia and low oxygen saturation; peripheries were cool."},{"date":"2026-10-03","kind":"discharge-summary","service":"hospital","title":"Cardiology acute event handover","data":{"stage":"sent","sentAt":"2026-10-03T10:45:00Z","sentBy":"Cardiology registrar","assignee":"Duty GP","sections":{"course":"Presented with prolonged central chest pain, hypotension and breathlessness; emergency cardiac assessment and circulatory support were initiated.","reason":"Emergency admission for suspected acute coronary syndrome with haemodynamic instability.","results":"Initial cardiac markers and electrocardiography were abnormal; urgent cardiology review and serial testing were arranged.","followUp":"Continue monitored cardiac care with repeat markers, echocardiography and assessment of perfusion.","diagnoses":"Working diagnosis was acute myocardial infarction complicated by cardiogenic shock; the final coronary anatomy was not yet documented.","gpActions":"Provide the known heart failure and diabetes history to the receiving cardiology team.","medicationChanges":"Acute antiplatelet and circulatory support decisions were made by cardiology; the ongoing list was pending."}},"text":"Presented with prolonged central chest pain, hypotension and breathlessness; emergency cardiac assessment and circulatory support were initiated."},{"date":"2026-10-04","kind":"hospital-note","service":"hospital","title":"Cardiogenic shock after infarction","text":"Chest pain recurred with pulmonary oedema, cool peripheries and hypotension despite cardiac support. The cardiology team discussed the limited response with family.","data":{"bloodPressure":"74/46","oxygenSaturation":80,"imaging":"pulmonary oedema","assessment":"cardiogenic shock","familyDiscussion":true}}]},{"patientId":"SIM-000283","deathDate":"2026-10-07","deathCause":"Acute kidney injury with hyperkalaemia in chronic kidney disease","events":[{"date":"2026-05-18","kind":"encounter","service":"gp","title":"Appetite and fatigue review","data":{"reason":"Chronic kidney disease and heart failure review","channel":"in-person"},"text":"He reports less appetite and more daytime sleep, while ankle swelling is unchanged; no chest pain or new breathlessness was described."},{"date":"2026-05-18","kind":"observation","service":"gp","title":"Weight and blood pressure check","data":{"value":"Weight 68.2 kg; blood pressure 104/62 mmHg; oral intake described as reduced.","category":"clinical assessment"},"text":"Weight was 68.2 kg and blood pressure 104/62 mmHg; reduced oral intake was noted."},{"date":"2026-06-20","kind":"report","service":"diagnostics","title":"Rising potassium and renal markers","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":134,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.7,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":8.6,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":118,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":54,"referenceLow":60,"referenceHigh":120}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-20T08:00:00Z"},"text":"Potassium and urea were raised with eGFR below range, representing a change from his earlier renal profile."},{"date":"2026-07-30","kind":"encounter","service":"gp","title":"Weakness and nausea","data":{"reason":"Worsening renal symptoms","channel":"telephone"},"text":"Increasing weakness and intermittent nausea were reported, with difficulty keeping fluids down; urgent renal blood tests were requested."},{"date":"2026-09-12","kind":"observation","service":"gp","title":"Low intake and postural symptoms","data":{"value":"Pulse 104 bpm; blood pressure 96/58 mmHg; reduced oral intake and postural light-headedness documented.","category":"clinical assessment"},"text":"Pulse was 104 bpm with low blood pressure and reduced intake; postural light-headedness was recorded."},{"date":"2026-10-05","kind":"hospital-attendance","service":"hospital","title":"Confusion with reduced urine output","data":{"stage":"triaged","acuity":"2","location":"Acute medical unit","arrivalAt":"2026-10-05T06:30:00Z","clinician":"Acute medical team","presentingComplaint":"Reduced urine output, vomiting and increasing confusion"},"text":"Presented with vomiting, oliguria and confusion; potassium was 6.2 mmol/L and emergency hyperkalaemia treatment was given."},{"date":"2026-10-06","kind":"discharge-summary","service":"hospital","title":"Renal deterioration medical handover","data":{"stage":"sent","sentAt":"2026-10-06T12:05:00Z","sentBy":"Renal medical registrar","assignee":"Practice document team","sections":{"course":"Presented with vomiting, poor intake, oliguria and confusion; fluid balance, cardiac status and renal replacement thresholds were reviewed.","reason":"Emergency admission for acute deterioration in chronic kidney disease with suspected electrolyte disturbance.","results":"Repeat testing showed worsening renal function and elevated potassium; electrocardiographic monitoring and serial profiles were requested.","followUp":"Continue monitored renal and cardiac care, repeat potassium promptly and review fluid replacement against heart failure status.","diagnoses":"Working diagnosis was acute kidney injury with hyperkalaemia on a background of chronic kidney disease.","gpActions":"Send the established heart failure history and recent contact details to the receiving renal team.","medicationChanges":"Potentially nephrotoxic medicines were held for review; the definitive medication plan remained with the inpatient team."}},"text":"Presented with vomiting, poor intake, oliguria and confusion; fluid balance, cardiac status and renal replacement thresholds were reviewed."},{"date":"2026-10-06","kind":"hospital-note","service":"hospital","title":"Progressive uraemic encephalopathy","text":"Renal function failed to recover and drowsiness progressed with poor intake. The renal team recorded uraemic encephalopathy and discussed a comfort-focused plan.","data":{"renalFunction":"not recovering","mentalState":"progressive drowsiness","assessment":"uraemic encephalopathy","familyDiscussion":true}}]},{"patientId":"SIM-000275","deathDate":"2026-10-11","deathCause":"Hypertensive encephalopathy with acute kidney injury","events":[{"date":"2026-06-01","kind":"encounter","service":"gp","title":"Morning headache review","data":{"reason":"Hypertension review","channel":"telephone"},"text":"She reports brief morning headaches and one missed blood pressure tablet; no visual loss, weakness or chest pain was reported at the visit."},{"date":"2026-06-01","kind":"observation","service":"gp","title":"Raised blood pressure observation","data":{"value":"Blood pressure 172/96 mmHg; pulse 88 bpm; repeat measurement remained elevated after rest.","category":"clinical assessment"},"text":"Blood pressure remained 172/96 mmHg on repeat measurement despite rest."},{"date":"2026-06-26","kind":"report","service":"diagnostics","title":"Renal trend with hypertension","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":132,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":4.7,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":8.2,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":46,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":54,"referenceLow":60,"referenceHigh":120}],"laboratory":"Riverside Pathology","collectedAt":"2026-06-26T08:00:00Z"},"text":"eGFR was 54 with raised urea and low sodium, adding renal concern to the persistent hypertension."},{"date":"2026-07-24","kind":"encounter","service":"gp","title":"Escalating headache and nausea","data":{"reason":"Worsening hypertension symptoms","channel":"in-person"},"text":"Headaches are more frequent with blurred vision and nausea; home pressures remain high despite treatment, so same-day assessment was advised."},{"date":"2026-10-08","kind":"hospital-attendance","service":"hospital","title":"Severe headache and confusion","data":{"stage":"triaged","acuity":"1","location":"Emergency assessment unit","arrivalAt":"2026-10-08T08:55:00Z","clinician":"Acute medical team","presentingComplaint":"Severe headache, vomiting and fluctuating confusion with marked hypertension"},"text":"Presented with severe headache, vomiting and fluctuating confusion alongside marked hypertension; renal and brain imaging were requested."},{"date":"2026-10-09","kind":"discharge-summary","service":"hospital","title":"Acute blood pressure handover","data":{"stage":"sent","sentAt":"2026-10-09T15:25:00Z","sentBy":"Acute medical registrar","assignee":"Duty GP","sections":{"course":"Admitted with very high blood pressure, headache and acute confusion; blood pressure reduction and renal monitoring were commenced.","reason":"Emergency admission for suspected hypertensive emergency with encephalopathy.","results":"Initial renal profile was abnormal and urgent brain imaging was requested; the imaging report was still being reviewed at handover.","followUp":"Continue neurological observations, controlled blood pressure reduction and repeat renal testing.","diagnoses":"Working diagnosis was hypertensive encephalopathy with acute kidney injury; alternative neurological causes remained under assessment.","gpActions":"Forward recent antihypertensive issues and diabetes history to the receiving medical team.","medicationChanges":"Intravenous blood pressure treatment was started; the long-term antihypertensive regimen was not yet finalised."}},"text":"Admitted with very high blood pressure, headache and acute confusion; blood pressure reduction and renal monitoring were commenced."},{"date":"2026-10-09","kind":"hospital-note","service":"hospital","title":"Persistent hypertensive encephalopathy","text":"Confusion and vomiting continued despite blood-pressure reduction; renal function worsened and the medical team discussed the guarded neurological outlook.","data":{"bloodPressure":"186/102","creatinine":142,"mentalState":"persistent confusion","assessment":"hypertensive encephalopathy with acute kidney injury","familyDiscussion":true}}]},{"patientId":"SIM-000272","deathDate":"2026-09-16","deathCause":"Pneumonia with acute hypoxic respiratory failure","events":[{"date":"2026-05-06","kind":"encounter","service":"gp","title":"Breathlessness on inclines","text":"Reports a few weeks of cough and breathlessness on inclines, without fever. Chest is clear today; inhaler use is slightly above usual.","data":{"channel":"telephone","reason":"Asthma and long-term condition review","oxygenSaturation":95,"respiratoryRate":18}},{"date":"2026-06-21","kind":"observation","service":"gp","title":"Early respiratory decline","text":"Family notes less appetite and audible wheeze in the evenings; there is no resting dyspnoea. Review was advised if sputum or fever develops.","data":{"category":"clinical","value":"SpO2 93% on air; temperature 37.4 C; weight 63.4 kg"}},{"date":"2026-07-26","kind":"report","service":"diagnostics","title":"Repeat full blood count","text":"White cells and neutrophils are lower than the previous sample, with CRP still raised; the practice requested an urgent repeat and infection safety-netting.","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count"},"analytes":[{"id":"white-cell-count","name":"White cell count","unit":"x10^9/L","value":1.4,"referenceLow":4,"referenceHigh":11},{"id":"neutrophils","name":"Neutrophils","unit":"x10^9/L","value":0.9,"referenceLow":2,"referenceHigh":7.5},{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":138,"referenceLow":115,"referenceHigh":165}]}},{"date":"2026-08-30","kind":"hospital-attendance","service":"hospital","title":"Admission with febrile cough","text":"Presented with two days of fever, productive cough and increasing work of breathing. Oxygen saturation was 88% on air; imaging suggested right lower-zone infection.","data":{"presentingComplaint":"Fever, productive cough and breathlessness","acuity":"urgent","location":"acute medical unit","oxygenSaturation":88,"temperatureC":38.3,"imaging":"right lower-zone air-space change"}},{"date":"2026-09-03","kind":"hospital-note","service":"hospital","title":"Pneumonia treatment review","text":"After IV antibiotics and supplemental oxygen, fever settled but neutrophils remained low and oxygen was still needed with exertion. Renal dosing was reviewed.","data":{"treatment":"intravenous antibiotics and oxygen","oxygen":"2 L/min with walking","neutrophils":0.6,"egfr":51}},{"date":"2026-09-14","kind":"hospital-attendance","service":"hospital","title":"Re-presentation with refractory hypoxaemia","text":"Returned increasingly drowsy with severe breathlessness despite treatment. Saturations remained low on high-flow oxygen and the respiratory team discussed the limited response with family.","data":{"presentingComplaint":"Worsening hypoxaemia during pneumonia recovery","acuity":"critical","oxygenSaturation":82,"support":"high-flow oxygen","familyDiscussion":true}}]},{"patientId":"SIM-000261","deathDate":"2026-09-22","deathCause":"Decompensated heart failure with cardiorenal syndrome","events":[{"date":"2026-05-09","kind":"encounter","service":"gp","title":"Evening oedema review","text":"At review, reports ankle swelling by evening and a 2 kg weight increase, but can still lie flat. No wheeze; daily weights were advised.","data":{"channel":"in-person","reason":"Heart failure and CKD review","weightKg":82.6,"bloodPressure":"148/86","oedema":"mild bilateral ankle"}},{"date":"2026-06-18","kind":"visit","service":"community","title":"Increasing nocturnal breathlessness","text":"Now waking once with breathlessness and walking more slowly; bilateral ankle oedema is mild. Medication reconciliation found no recent change.","data":{"setting":"home visit","weightKg":84.1,"oxygenSaturation":94,"respiratoryRate":20}},{"date":"2026-07-29","kind":"report","service":"diagnostics","title":"Renal and congestion markers","text":"Urea and creatinine have risen from baseline with potassium 5.5; a markedly raised NT-proBNP prompted same-week heart-failure assessment.","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea and electrolytes"},"analytes":[{"id":"creatinine","name":"Creatinine","unit":"umol/L","value":98,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m2","value":58,"referenceLow":60,"referenceHigh":120},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.5,"referenceLow":3.5,"referenceHigh":5.3}],"relatedMarker":{"name":"NT-proBNP","unit":"ng/L","value":3560}}},{"date":"2026-08-17","kind":"hospital-attendance","service":"hospital","title":"Acute fluid overload","text":"Arrived with orthopnoea, rapid weight gain and bilateral crackles. Chest radiograph showed vascular congestion; IV diuresis was started on the acute medical unit.","data":{"presentingComplaint":"Orthopnoea and worsening leg swelling","acuity":"urgent","location":"acute medical unit","imaging":"pulmonary vascular congestion","treatment":"intravenous loop diuretic"}},{"date":"2026-08-26","kind":"discharge-summary","service":"hospital","title":"Heart-failure discharge review","text":"Breathing improved after IV diuresis, although renal function remained below usual baseline. Home weight checks and repeat renal bloods were arranged.","data":{"stage":"sent","sections":{"course":"Admitted with fluid overload and orthopnoea; intravenous diuresis improved breathing over several days.","reason":"Acute breathlessness and increasing peripheral oedema in established heart failure.","results":"Chest imaging showed vascular congestion. Renal function remained below baseline and potassium required surveillance.","followUp":"Heart-failure and renal clinic review requested within one week, with daily weights at home.","diagnoses":"Acute decompensated heart failure with cardiorenal vulnerability.","gpActions":"Repeat U&E, review diuretic response and check blood pressure at the practice.","medicationChanges":"Loop diuretic adjusted; other medicines to be reviewed when renal function is stable."}}},{"date":"2026-09-20","kind":"hospital-attendance","service":"hospital","title":"Low-output heart-failure deterioration","text":"Returned with severe breathlessness, cool peripheries and falling urine output despite oral diuretic treatment. The team documented concern for low-output failure.","data":{"presentingComplaint":"Recurrent pulmonary congestion and oliguria","acuity":"critical","bloodPressure":"88/54","oxygenSaturation":86,"creatinine":186,"assessment":"suspected low-output cardiac failure"}}]},{"patientId":"SIM-000250","deathDate":"2026-09-13","deathCause":"Hyperosmolar hyperglycaemic state due to diabetes","events":[{"date":"2026-05-02","kind":"encounter","service":"gp","title":"Interpreter-supported diabetes review","text":"During interpreter-supported review, increased thirst and overnight urination were mentioned without vomiting or confusion. HbA1c follow-up was brought forward.","data":{"channel":"in-person","reason":"Diabetes and hypertension review","interpreter":true,"capillaryGlucose":16.8}},{"date":"2026-06-24","kind":"observation","service":"gp","title":"High home glucose readings","text":"Home capillary glucose has often been above 18 mmol/L and the mouth feels dry; the patient remains oriented and is managing fluids.","data":{"category":"clinical","value":"capillary glucose 18.7 mmol/L; ketones 0.4 mmol/L; interpreter present"}},{"date":"2026-07-23","kind":"report","service":"diagnostics","title":"Rising glycaemia and sodium change","text":"HbA1c is 71 mmol/mol with sodium 130 mmol/L and platelets 162. The result was discussed with the practice and medication review was expedited.","data":{"kind":"blood-result","panel":{"id":"hba1c","name":"HbA1c"},"analytes":[{"id":"hba1c","name":"HbA1c","unit":"mmol/mol","value":71,"referenceLow":20,"referenceHigh":41}],"relatedResults":{"sodium":130,"platelets":162}}},{"date":"2026-08-18","kind":"encounter","service":"gp","title":"Diabetes review after weight loss","text":"Four kilograms have been lost since spring and appetite is variable. Capillary glucose was 26.2 mmol/L with trace ketones; urgent sick-day advice was given.","data":{"channel":"telephone","reason":"Uncontrolled diabetes review","weightChangeKg":-4,"capillaryGlucose":26.2,"ketones":0.6}},{"date":"2026-09-06","kind":"hospital-attendance","service":"hospital","title":"Hyperglycaemic emergency","text":"Presented drowsy and dehydrated with glucose 38.6 mmol/L, calculated osmolality 329 and no marked ketonaemia. IV fluids and insulin were commenced.","data":{"presentingComplaint":"Drowsiness, thirst and dehydration","acuity":"emergency","glucose":38.6,"osmolality":329,"ketones":1.1,"treatment":"intravenous fluids and insulin"}},{"date":"2026-09-10","kind":"hospital-note","service":"hospital","title":"Persistent hyperosmolar state","text":"Mental state improved only briefly; sodium remained low and oral intake was poor. The team documented a guarded outlook while continuing hydration and glucose control.","data":{"glucose":31.4,"sodium":128,"oralIntake":"poor","assessment":"ongoing hyperosmolar physiology","outlook":"guarded"}}]},{"patientId":"SIM-000245","deathDate":"2026-09-18","deathCause":"Acute pulmonary oedema from decompensated heart failure","events":[{"date":"2026-04-30","kind":"encounter","service":"gp","title":"Subtle orthopnoea at review","text":"Interpreter-supported review found new breathlessness on stairs and needing an extra pillow, without chest pain. There was trace ankle swelling and no acute distress.","data":{"channel":"in-person","reason":"Heart failure and CKD review","interpreter":true,"bloodPressure":"148/82","oedema":"trace"}},{"date":"2026-06-13","kind":"visit","service":"community","title":"Weight and fluid review","text":"Weight is up 2.5 kg and there is mild bilateral oedema with fine basal crackles. The patient is comfortable at rest; a same-week clinical review was requested.","data":{"setting":"home visit","weightChangeKg":2.5,"respiratoryRate":21,"oxygenSaturation":93,"crackles":"fine bibasal"}},{"date":"2026-07-25","kind":"report","service":"diagnostics","title":"Renal panel after swelling","text":"Renal function is near the prior baseline but potassium is 3.3; persistent inflammatory marker elevation and worsening oedema led to cardiac assessment.","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea and electrolytes"},"analytes":[{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m2","value":88,"referenceLow":60,"referenceHigh":120},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":3.3,"referenceLow":3.5,"referenceHigh":5.3},{"id":"creatinine","name":"Creatinine","unit":"umol/L","value":136,"referenceLow":45,"referenceHigh":110}],"relatedResults":{"crp":15.1}}},{"date":"2026-08-31","kind":"hospital-attendance","service":"hospital","title":"Acute pulmonary oedema","text":"Presented gasping with marked orthopnoea; saturation was 84% on air and bilateral crackles were heard. Imaging was consistent with pulmonary oedema and IV diuresis began.","data":{"presentingComplaint":"Severe breathlessness and orthopnoea","acuity":"emergency","oxygenSaturation":84,"imaging":"bilateral pulmonary oedema","treatment":"intravenous diuresis and oxygen"}},{"date":"2026-09-08","kind":"discharge-summary","service":"hospital","title":"Post-oedema discharge plan","text":"Breathing improved after treatment but oedema recurred with minimal exertion. The discharge plan included interpreter-supported medicines review, daily weights and rapid return for breathlessness.","data":{"stage":"sent","sections":{"course":"Treated for acute pulmonary oedema with oxygen and intravenous diuresis; breathlessness eased at rest before discharge.","reason":"Emergency attendance for severe orthopnoea, peripheral oedema and low oxygen saturation.","results":"Imaging was consistent with pulmonary oedema. Exertional breathlessness and oedema persisted after treatment.","followUp":"Interpreter-supported heart-failure review, daily weights and rapid return for worsening breathlessness.","diagnoses":"Acute pulmonary oedema in decompensated chronic heart failure.","gpActions":"Check renal profile, potassium, blood pressure and response to the revised diuretic plan.","medicationChanges":"Diuretic regimen increased with further changes deferred pending renal and electrolyte results."}}},{"date":"2026-09-17","kind":"hospital-note","service":"hospital","title":"Refractory congestion","text":"Breathlessness returned with hypotension and increasing oxygen need despite further diuresis. Family and the treating team discussed a comfort-focused approach if recovery failed.","data":{"bloodPressure":"92/56","oxygenSaturation":81,"support":"supplemental oxygen","responseToDiuresis":"limited","familyDiscussion":true}}]},{"patientId":"SIM-000236","deathDate":"2026-09-15","deathCause":"Large ischaemic stroke with aspiration pneumonia","events":[{"date":"2026-04-25","kind":"encounter","service":"gp","title":"Brief focal symptoms","text":"Brief episodes of right-hand clumsiness while dressing resolved within minutes; no deficit was found on examination. Vascular safety-netting was discussed.","data":{"channel":"in-person","reason":"Diabetes and hypertension review","bloodPressure":"162/90","neurologicalExam":"normal"}},{"date":"2026-06-15","kind":"observation","service":"gp","title":"Transient language disturbance","text":"Family reports a short spell of word-finding difficulty yesterday; speech was normal in clinic. Same-week TIA assessment was requested rather than routine follow-up.","data":{"category":"neurological","value":"transient dysphasia reported; normal speech at review; urgent TIA pathway"}},{"date":"2026-07-30","kind":"referral","service":"hospital","title":"Neurovascular assessment requested","text":"Recurrent brief language disturbance has been reported in the setting of hypertension and diabetes; referral asks for TIA review and vascular imaging.","data":{"pathway":"urgent","reason":"Recurrent transient dysphasia and right-hand clumsiness","requestedTests":["brain imaging","vascular imaging","ECG"]}},{"date":"2026-08-27","kind":"hospital-attendance","service":"hospital","title":"Acute focal neurological deficit","text":"Sudden left facial droop and arm weakness with aphasia began at home. CT excluded haemorrhage; the stroke team considered an acute right hemispheric infarct.","data":{"presentingComplaint":"Left facial weakness, arm weakness and aphasia","acuity":"emergency","nihss":8,"ct":"no intracranial haemorrhage","suspectedSite":"right cerebral hemisphere"}},{"date":"2026-09-01","kind":"hospital-note","service":"hospital","title":"Confirmed right MCA infarct","text":"MRI confirmed a right MCA infarct. Swallow assessment showed aspiration risk, and antiplatelet treatment was started with close neurological observation.","data":{"imaging":"acute right MCA infarct","swallow":"unsafe thin fluids","treatment":"antiplatelet therapy","aspirationRisk":"high"}},{"date":"2026-09-09","kind":"hospital-attendance","service":"hospital","title":"Aspiration-related deterioration","text":"Neurological status worsened with fever and coughing during feeds; oxygen need increased and chest findings were consistent with aspiration. Escalation options were reviewed.","data":{"presentingComplaint":"Fever, cough during feeds and reduced responsiveness","acuity":"urgent","oxygenSaturation":88,"suspectedComplication":"aspiration pneumonia","familyDiscussion":true}}]},{"patientId":"SIM-000227","deathDate":"2026-09-24","deathCause":"Fatal ventricular arrhythmia precipitated by severe hypokalaemia","events":[{"date":"2026-05-11","kind":"encounter","service":"gp","title":"Cramps and brief palpitations","text":"Reports intermittent calf cramps and brief palpitations after walking, without syncope. Heart-failure examination is stable; potassium 3.2 was noted for repeat testing.","data":{"channel":"in-person","reason":"Heart failure review","bloodPressure":"136/78","potassium":3.2,"oedema":"unchanged"}},{"date":"2026-06-26","kind":"observation","service":"gp","title":"Irregular home pulse readings","text":"Home pulse readings have been irregular at times while swelling is unchanged. An ECG and repeat electrolytes were requested before altering heart-failure medicines.","data":{"category":"clinical","value":"intermittent irregular pulse; no syncope; repeat ECG and electrolytes requested"}},{"date":"2026-07-28","kind":"report","service":"diagnostics","title":"Marked electrolyte depletion","text":"Potassium is 2.7 mmol/L with magnesium 0.58 and a borderline prolonged QTc; urgent replacement and same-day clinical review were advised.","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea and electrolytes"},"analytes":[{"id":"potassium","name":"Potassium","unit":"mmol/L","value":2.7,"referenceLow":3.5,"referenceHigh":5.3}],"relatedResults":{"magnesium":0.58,"qtcMs":495}}},{"date":"2026-08-21","kind":"hospital-attendance","service":"hospital","title":"Near-syncope with ventricular ectopy","text":"Near-syncope occurred while standing; potassium was 2.6 and telemetry showed frequent ventricular ectopy. Intravenous replacement was given.","data":{"presentingComplaint":"Near-syncope and palpitations","acuity":"urgent","potassium":2.6,"telemetry":"frequent ventricular ectopy","treatment":"intravenous potassium and magnesium"}},{"date":"2026-08-22","kind":"discharge-summary","service":"hospital","title":"Electrolyte replacement discharge","text":"Symptoms settled after electrolyte correction and no sustained arrhythmia was captured. A repeat blood test and medication review were arranged within one week.","data":{"stage":"sent","sections":{"course":"Observed after near-syncope with severe hypokalaemia and ventricular ectopy; intravenous potassium and magnesium corrected the immediate deficit.","reason":"Near-syncope and palpitations in the setting of low potassium and heart-failure treatment.","results":"Potassium and magnesium improved after replacement; no sustained arrhythmia was captured during monitoring.","followUp":"Repeat electrolytes and heart-failure medicines review within one week, with return advice for palpitations.","diagnoses":"Symptomatic hypokalaemia with ventricular ectopy.","gpActions":"Repeat U&E and magnesium promptly, reconcile diuretics and review the ECG result.","medicationChanges":"Oral potassium replacement supplied; possible diuretic contribution to be reassessed."}}},{"date":"2026-09-23","kind":"hospital-attendance","service":"hospital","title":"Recurrent ventricular tachycardia","text":"Collapsed with pulseless ventricular tachycardia despite recent oral replacement. Circulation returned briefly after resuscitation, but recurrent arrhythmia and severe hypokalaemia persisted.","data":{"presentingComplaint":"Collapse and pulseless ventricular tachycardia","acuity":"critical","rhythm":"ventricular tachycardia","potassium":2.4,"resuscitation":"temporary return of circulation"}}]},{"patientId":"SIM-000222","deathDate":"2026-09-19","deathCause":"Acute myocardial infarction with cardiogenic shock","events":[{"date":"2026-05-13","kind":"encounter","service":"gp","title":"Exertional chest pressure","text":"Occasional central pressure after climbing stairs now lasts five minutes and settles with rest; no pain is present at review. Urgent cardiac assessment was advised.","data":{"channel":"in-person","reason":"Hypertension and heart-failure review","bloodPressure":"164/88","symptoms":"exertional chest pressure"}},{"date":"2026-06-29","kind":"observation","service":"gp","title":"Increasing exertional episodes","text":"Episodes are more frequent and now occur with lighter activity, with breathlessness but no syncope. ECG and troponin assessment were requested rather than routine follow-up.","data":{"category":"cardiac","value":"recurrent exertional chest pressure with breathlessness; urgent ECG and troponin pathway"}},{"date":"2026-07-31","kind":"observation","service":"hospital","title":"Rising cardiac injury marker","text":"High-sensitivity troponin was 86 ng/L and rose to 174 on repeat; creatinine was 158 with eGFR 48. Cardiology accepted referral for suspected NSTEMI.","data":{"category":"cardiac-marker","value":"hs-troponin 86 ng/L rising to 174 ng/L; creatinine 158 umol/L; eGFR 48"}},{"date":"2026-08-24","kind":"hospital-attendance","service":"hospital","title":"Non-ST elevation infarction","text":"Presented with persistent chest pain and pulmonary congestion. ECG showed dynamic ST-T changes; renal-adjusted antithrombotic treatment was started.","data":{"presentingComplaint":"Persistent chest pain and breathlessness","acuity":"emergency","ecg":"dynamic ST-T changes","assessment":"suspected NSTEMI","treatment":"renal-adjusted antithrombotic therapy"}},{"date":"2026-09-02","kind":"discharge-summary","service":"hospital","title":"Post-infarct medical management","text":"Chest pain settled with medical treatment, but exertional dyspnoea and renal impairment remained. Close heart-failure and renal follow-up was arranged after discharge.","data":{"stage":"sent","sections":{"course":"Managed for a non-ST elevation myocardial infarction with pulmonary congestion; chest pain settled on medical treatment.","reason":"Persistent chest pain with dynamic ECG changes and a rising cardiac injury marker.","results":"Renal impairment complicated treatment and exertional dyspnoea remained after the acute episode.","followUp":"Early heart-failure and renal review after discharge, with urgent return advice for recurrent chest pain.","diagnoses":"Non-ST elevation myocardial infarction with acute congestion.","gpActions":"Check symptoms, blood pressure, renal function and adherence to the cardiac medicines plan.","medicationChanges":"Antithrombotic and anti-anginal treatment continued with renal-adjusted dosing."}}},{"date":"2026-09-11","kind":"hospital-attendance","service":"hospital","title":"Cardiogenic shock after recurrent infarction","text":"Returned with severe chest pain, mottled cool skin and hypotension. Repeat ECG suggested an acute infarction with pulmonary oedema and poor perfusion.","data":{"presentingComplaint":"Recurrent chest pain, hypotension and breathlessness","acuity":"critical","bloodPressure":"76/48","ecg":"acute ischaemic changes","imaging":"pulmonary oedema","assessment":"cardiogenic shock"}}]},{"patientId":"SIM-000220","deathDate":"2026-09-21","deathCause":"Aspiration pneumonia with sepsis","events":[{"date":"2026-04-24","kind":"encounter","service":"gp","title":"Coughing with drinks","text":"Occasional coughing with thin drinks was mentioned at review, without fever or weight loss. Swallowing advice was offered and respiratory examination was unchanged.","data":{"channel":"telephone","reason":"Diabetes and heart-failure review","temperatureC":36.8,"respiratoryExam":"unchanged"}},{"date":"2026-06-10","kind":"visit","service":"community","title":"Wet cough after meals","text":"Appetite has fallen and family notice a wet cough after meals; oxygen saturation is 93% on air. A swallowing assessment was requested.","data":{"setting":"home visit","oxygenSaturation":93,"weightChangeKg":-2.1,"request":"swallowing assessment"}},{"date":"2026-07-22","kind":"observation","service":"community","title":"Increasing aspiration concern","text":"Coughing with fluids is more frequent and there are fine bibasal crackles; temperature is 37.8 C. Texture modification was advised while awaiting assessment.","data":{"category":"clinical","value":"cough with fluids; fine bibasal crackles; temperature 37.8 C; aspiration precautions advised"}},{"date":"2026-08-28","kind":"hospital-attendance","service":"hospital","title":"Febrile lower respiratory infection","text":"Presented febrile and hypoxic after two days of productive cough. Imaging showed dependent lower-lobe consolidation; IV antibiotics and oxygen were started.","data":{"presentingComplaint":"Fever, productive cough and hypoxia","acuity":"urgent","oxygenSaturation":86,"imaging":"dependent lower-lobe consolidation","treatment":"intravenous antibiotics and oxygen"}},{"date":"2026-09-05","kind":"hospital-note","service":"hospital","title":"Ongoing aspiration precautions","text":"Oxygen need fell briefly, but swallowing remained unsafe and renal function limited antibiotic choices. Family were taught aspiration precautions before transfer.","data":{"swallow":"unsafe","oxygen":"2 L/min","renalAdjustment":true,"familyTeaching":"aspiration precautions"}},{"date":"2026-09-12","kind":"hospital-attendance","service":"hospital","title":"Septic respiratory deterioration","text":"Returned with rigors, hypotension and worsening oxygen requirement; lactate was 4.1 and blood cultures were taken for suspected septic deterioration.","data":{"presentingComplaint":"Rigors, hypotension and worsening hypoxia","acuity":"critical","lactate":4.1,"bloodPressure":"84/50","investigations":"blood cultures taken"}}]},{"patientId":"SIM-000170","deathDate":"2026-09-28","deathCause":"Acute-on-chronic kidney failure with uraemic encephalopathy","events":[{"date":"2026-05-07","kind":"encounter","service":"gp","title":"Early renal deterioration","text":"Increasing ankle swelling and early satiety were noted, but no vomiting or confusion. Blood pressure was 158/86; renal bloods and fluid advice were arranged.","data":{"channel":"telephone","reason":"Diabetes, hypertension and CKD review","bloodPressure":"158/86","oedema":"ankle","symptoms":"early satiety"}},{"date":"2026-06-11","kind":"observation","service":"gp","title":"Fatigue and variable urine output","text":"Fatigue is affecting daily tasks and urine output varies; there is no acute breathlessness. Repeat renal profile was requested before changing medicines.","data":{"category":"clinical","value":"increasing fatigue; variable urine output; no acute breathlessness"}},{"date":"2026-07-24","kind":"report","service":"diagnostics","title":"Worsening renal profile","text":"eGFR is 42 with urea 10.6 and potassium 5.5 mmol/L; haemoglobin is 114. Nephrology review was requested for worsening CKD.","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea and electrolytes"},"analytes":[{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m2","value":42,"referenceLow":60,"referenceHigh":120},{"id":"urea","name":"Urea","unit":"mmol/L","value":10.6,"referenceLow":2.5,"referenceHigh":7.8},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.5,"referenceLow":3.5,"referenceHigh":5.3}],"relatedResults":{"haemoglobin":114}}},{"date":"2026-08-25","kind":"referral","service":"hospital","title":"Urgent renal assessment","text":"Referral describes progressive renal decline, reduced intake and intermittent nausea despite conservative measures; assessment was requested within days.","data":{"pathway":"urgent","reason":"Progressive CKD with reduced intake, nausea and rising potassium","requestedService":"renal medicine"}},{"date":"2026-09-07","kind":"hospital-attendance","service":"hospital","title":"Acute kidney injury with hyperkalaemia","text":"Presented dehydrated with vomiting, confusion and very little urine. Creatinine was 218, potassium 6.2 and ECG showed peaked T waves; emergency treatment was given.","data":{"presentingComplaint":"Vomiting, confusion and oliguria","acuity":"emergency","creatinine":218,"potassium":6.2,"ecg":"peaked T waves","treatment":"emergency hyperkalaemia treatment and intravenous fluid"}},{"date":"2026-09-25","kind":"hospital-note","service":"hospital","title":"Progressive uraemic encephalopathy","text":"Renal function failed to recover and drowsiness progressed with poor intake. The team recorded uraemic encephalopathy and discussed a comfort-focused plan with family.","data":{"renalFunction":"not recovering","mentalState":"progressive drowsiness","assessment":"uraemic encephalopathy","familyDiscussion":true}}]},{"patientId":"SIM-000168","deathDate":"2026-09-29","deathCause":"Status asthmaticus with acute respiratory failure","events":[{"date":"2026-05-04","kind":"encounter","service":"gp","title":"Night cough and reliever use","text":"Night cough has become more frequent and the reliever inhaler is needed twice most evenings; there is no fever. Peak flow is below usual.","data":{"channel":"in-person","reason":"Asthma and heart-failure review","peakFlow":260,"oxygenSaturation":96,"temperatureC":36.7}},{"date":"2026-06-16","kind":"observation","service":"gp","title":"Morning wheeze at home","text":"Home readings show morning wheeze and oxygen saturation around 94%; inhaler technique was checked and a safety-net review arranged.","data":{"category":"respiratory","value":"morning wheeze; home SpO2 approximately 94%; inhaler technique checked"}},{"date":"2026-07-20","kind":"report","service":"diagnostics","title":"Persistent respiratory inflammation","text":"CRP remains raised at 9.8 mg/L and renal markers are stable. Ongoing symptoms prompted a respiratory review despite no acute infection history.","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein"},"analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":9.8,"referenceLow":0,"referenceHigh":5}]}},{"date":"2026-08-23","kind":"visit","service":"community","title":"Frequent nocturnal wheeze","text":"Using the reliever inhaler every few hours on bad nights and avoiding stairs because of breathlessness; examination improved after nebulised bronchodilator.","data":{"setting":"home visit","peakFlow":180,"oxygenSaturation":92,"treatment":"nebulised bronchodilator","response":"partial improvement"}},{"date":"2026-09-04","kind":"hospital-attendance","service":"hospital","title":"Severe asthma exacerbation","text":"Arrived with severe wheeze and inability to complete sentences; oxygen saturation was 84% on air. Nebulisers, steroids and controlled oxygen were started.","data":{"presentingComplaint":"Severe wheeze and respiratory distress","acuity":"emergency","oxygenSaturation":84,"speech":"unable to complete sentences","treatment":"nebulised bronchodilators, systemic steroids and controlled oxygen"}},{"date":"2026-09-26","kind":"hospital-note","service":"hospital","title":"Refractory ventilatory failure","text":"Respiratory effort worsened despite continuous bronchodilators and non-invasive support. Blood gases showed rising carbon dioxide; escalation was limited after a goals-of-care discussion.","data":{"support":"continuous bronchodilators and non-invasive ventilation","bloodGas":"rising carbon dioxide","response":"poor","goalsOfCareDiscussion":true}}]},{"patientId":"SIM-000115","deathDate":"2026-10-04","deathCause":"Community-acquired pneumonia","timeline":[{"date":"2026-05-19","kind":"encounter","service":"gp","title":"Asthma review","data":{"text":"A mild morning cough and occasional wheeze occur on hills, without fever. Continue inhalers and review if breathlessness increases.","reason":"Asthma","channel":"telephone"}},{"date":"2026-06-23","kind":"observation","service":"gp","title":"Respiratory check","data":{"value":"Peak flow 260 L/min; oxygen saturation 95% on air; mild wheeze after walking.","category":"respiratory assessment"}},{"date":"2026-07-31","kind":"report","service":"diagnostics","title":"Worsening blood count","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":119,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":14.1,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":216,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":104.8,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":9.2,"referenceLow":2,"referenceHigh":7.5}],"collectedAt":1785484800000}},{"date":"2026-08-24","kind":"encounter","service":"gp","title":"Worsening wheeze review","data":{"text":"Breathlessness is more frequent with yellow sputum and evening salbutamol use. Scattered wheeze; prompt review if fever develops.","reason":"Worsening asthma symptoms","channel":"in-person"}},{"date":"2026-09-17","kind":"hospital-attendance","service":"hospital","title":"Acute breathlessness assessment","data":{"stage":"triaged","acuity":"2","location":"Emergency department","arrivalAt":1789632000000,"clinician":"Unassigned","presentingComplaint":"Three days of productive cough and increasing breathlessness"}},{"date":"2026-09-23","kind":"discharge-summary","service":"hospital","title":"Respiratory infection discharge","data":{"stage":"sent","sentAt":1790154000000,"sentBy":"Dr Priya Nair","assignee":"duty GP","sections":{"course":"Admitted with community-acquired pneumonia and an asthma flare after productive cough and increasing breathlessness. Required oxygen and intravenous antibiotics.","reason":"Worsening breathlessness with suspected lower respiratory infection.","results":"Chest imaging reported patchy right basal change. CRP was raised; renal function was monitored because of CKD.","followUp":"GP review within 48 hours, with safety-netting for fever, confusion or increasing breathlessness.","diagnoses":"Community-acquired pneumonia with asthma exacerbation; CKD noted as a comorbidity.","gpActions":"Confirm inhaler use, repeat renal profile and inflammatory markers, and check oxygen saturation.","medicationChanges":"Antibiotic and inhaler courses were supplied; follow the discharge prescription."}}},{"date":"2026-09-30","kind":"encounter","service":"gp","title":"Post-discharge respiratory review","data":{"text":"Breathlessness returned after discharge with poor appetite and thicker sputum. Oxygen saturation was below baseline; urgent review.","reason":"Post-discharge respiratory deterioration","channel":"telephone"}}]},{"patientId":"SIM-000111","deathDate":"2026-10-10","deathCause":"Acute myocardial infarction","timeline":[{"date":"2026-05-27","kind":"encounter","service":"gp","title":"Exertional chest pressure review","data":{"text":"Chest pressure occurs when hurrying and settles after a few minutes' rest. No pain at rest; ECG and blood-pressure review arranged.","reason":"Hypertension review","channel":"telephone"}},{"date":"2026-06-29","kind":"observation","service":"gp","title":"Blood pressure assessment","data":{"value":"154/88 mmHg seated; pulse 78 bpm, regular; no chest pain during assessment.","category":"blood pressure"}},{"date":"2026-07-27","kind":"report","service":"diagnostics","title":"Renal and electrolyte review","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":143,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.5,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":10.2,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":121,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":56,"referenceLow":60,"referenceHigh":120}],"collectedAt":1785139200000}},{"date":"2026-08-27","kind":"report","service":"diagnostics","title":"Falling blood counts","data":{"kind":"blood-result","panel":{"id":"fbc","name":"Full blood count (FBC)"},"analytes":[{"id":"haemoglobin","name":"Haemoglobin","unit":"g/L","value":116,"referenceLow":115,"referenceHigh":165},{"id":"white-cell-count","name":"White cell count","unit":"×10⁹/L","value":7.1,"referenceLow":4,"referenceHigh":11},{"id":"platelets","name":"Platelets","unit":"×10⁹/L","value":126,"referenceLow":150,"referenceHigh":400},{"id":"mcv","name":"Mean cell volume","unit":"fL","value":91,"referenceLow":80,"referenceHigh":100},{"id":"neutrophils","name":"Neutrophils","unit":"×10⁹/L","value":4.8,"referenceLow":2,"referenceHigh":7.5}],"collectedAt":1787817600000}},{"date":"2026-09-21","kind":"encounter","service":"gp","title":"Recurrent chest tightness review","data":{"text":"Fatigue and breathlessness on stairs increased. Two brief chest-tightness episodes settled with rest; urgent cardiac review discussed.","reason":"Chest discomfort","channel":"in-person"}},{"date":"2026-09-28","kind":"hospital-attendance","service":"hospital","title":"Central chest pain attendance","data":{"stage":"triaged","acuity":"2","location":"Emergency department","arrivalAt":1790582400000,"clinician":"Unassigned","presentingComplaint":"Persistent central chest pressure with sweating and nausea"}},{"date":"2026-10-05","kind":"discharge-summary","service":"hospital","title":"Cardiac assessment discharge","data":{"stage":"sent","sentAt":1791190800000,"sentBy":"Dr James Osei","assignee":"duty GP","sections":{"course":"Admitted after chest pressure and dynamic ECG changes. Cardiology treated suspected non-ST-elevation myocardial infarction and monitored renal function.","reason":"Exertional then resting chest discomfort with diaphoresis in diabetes and hypertension.","results":"Serial troponin was abnormal and cardiology reviewed the ECG. Coronary assessment was arranged.","followUp":"Early cardiology and GP review requested. Return for pain, breathlessness, faintness or sweating.","diagnoses":"Working diagnosis: non-ST-elevation myocardial infarction, with diabetes and hypertension.","gpActions":"Reconcile cardiac medicines, check blood pressure and renal profile, and confirm cardiology follow-up.","medicationChanges":"Antiplatelet and lipid-lowering treatment started; doses are on the discharge prescription."}}},{"date":"2026-10-08","kind":"encounter","service":"gp","title":"Post-discharge chest pain review","data":{"text":"Since discharge, central chest discomfort has occurred at rest with nausea. Do not drive; call emergency services if it recurs.","reason":"Post-discharge cardiac symptoms","channel":"telephone"}}]},{"patientId":"SIM-000108","deathDate":"2026-10-14","deathCause":"Urosepsis","timeline":[{"date":"2026-05-31","kind":"encounter","service":"gp","title":"Urinary frequency review","data":{"text":"Urinary frequency was noted without dysuria or fever. Hydration and a urine sample were advised; diabetes and kidney review planned.","reason":"Diabetes and CKD review","channel":"telephone"}},{"date":"2026-06-27","kind":"observation","service":"gp","title":"Urinalysis check","data":{"value":"Leukocytes 1+, trace protein, nitrite negative; urine sent for culture.","category":"urinalysis"}},{"date":"2026-07-18","kind":"report","service":"diagnostics","title":"Kidney function review","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":136,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.4,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":5.1,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":91,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":69,"referenceLow":60,"referenceHigh":120}],"collectedAt":1784361600000}},{"date":"2026-08-20","kind":"encounter","service":"gp","title":"Dysuria and appetite review","data":{"text":"New dysuria and nocturia developed with reduced appetite, but no flank pain. Urine culture sent; same-week reassessment arranged.","reason":"Urinary symptoms","channel":"in-person"}},{"date":"2026-09-13","kind":"report","service":"diagnostics","title":"Raised inflammatory marker","data":{"kind":"blood-result","panel":{"id":"crp","name":"C-reactive protein (CRP)"},"analytes":[{"id":"crp","name":"C-reactive protein","unit":"mg/L","value":28.6,"referenceLow":0,"referenceHigh":5}],"collectedAt":1789286400000}},{"date":"2026-09-22","kind":"hospital-attendance","service":"hospital","title":"Febrile urinary illness attendance","data":{"stage":"triaged","acuity":"2","location":"Emergency department","arrivalAt":1790064000000,"clinician":"Unassigned","presentingComplaint":"Fever, rigors, confusion and right flank pain"}},{"date":"2026-09-27","kind":"discharge-summary","service":"hospital","title":"Urinary infection discharge","data":{"stage":"sent","sentAt":1790499600000,"sentBy":"Dr Hannah Clarke","assignee":"duty GP","sections":{"course":"Admitted with fever, rigors and confusion during a urinary infection. Intravenous fluids and antibiotics were given while renal function was monitored.","reason":"Worsening dysuria, poor intake and systemic symptoms despite oral treatment.","results":"Urine testing supported bacterial infection; creatinine rose above baseline before partly improving. Blood cultures were followed.","followUp":"Complete antibiotics and arrange GP review within 48 hours. Seek urgent help for fever, confusion, vomiting or reduced urine.","diagnoses":"Complicated urinary infection with acute kidney injury on CKD; diabetes noted as a risk factor.","gpActions":"Repeat renal profile, review culture results and hydration, and check glucose control.","medicationChanges":"Antibiotics changed to an oral course according to microbiology advice; no other long-term medicines altered."}}},{"date":"2026-10-09","kind":"encounter","service":"gp","title":"Recurrent infection review","data":{"text":"After antibiotics, fever and weakness returned with little urine. Emergency review was advised for recurrent infection and dehydration.","reason":"Post-infection deterioration","channel":"telephone"}}]},{"patientId":"SIM-000001","deathDate":"2026-10-18","deathCause":"Acute decompensated heart failure","timeline":[{"date":"2026-05-24","kind":"encounter","service":"gp","title":"Early fluid-retention review","data":{"text":"More ankle swelling occurs by evening, though walking to the shops remains possible. Her daughter will record weights twice weekly.","reason":"Heart failure review","channel":"in-person"}},{"date":"2026-06-30","kind":"observation","service":"gp","title":"Weight and oedema check","data":{"value":"Weight 76.4 kg, 1.8 kg above home baseline; mild bilateral ankle oedema; oxygen saturation 95%.","category":"heart failure monitoring"}},{"date":"2026-07-21","kind":"report","service":"diagnostics","title":"Renal profile during fluid gain","data":{"kind":"blood-result","panel":{"id":"ue","name":"Urea & electrolytes (U&E)"},"analytes":[{"id":"sodium","name":"Sodium","unit":"mmol/L","value":141,"referenceLow":133,"referenceHigh":146},{"id":"potassium","name":"Potassium","unit":"mmol/L","value":5.5,"referenceLow":3.5,"referenceHigh":5.3},{"id":"urea","name":"Urea","unit":"mmol/L","value":9.4,"referenceLow":2.5,"referenceHigh":7.8},{"id":"creatinine","name":"Creatinine","unit":"µmol/L","value":133,"referenceLow":45,"referenceHigh":110},{"id":"egfr","name":"eGFR","unit":"mL/min/1.73m²","value":46,"referenceLow":60,"referenceHigh":120}],"collectedAt":1784620800000}},{"date":"2026-08-31","kind":"encounter","service":"gp","title":"Progressive orthopnoea review","data":{"text":"Breathlessness limits the walk to the front door and three pillows are needed at night. A three-kilogram gain occurred over two weeks.","reason":"Worsening heart failure symptoms","channel":"telephone"}},{"date":"2026-09-19","kind":"hospital-attendance","service":"hospital","title":"Breathlessness and oedema attendance","data":{"stage":"triaged","acuity":"2","location":"Emergency department","arrivalAt":1789804800000,"clinician":"Unassigned","presentingComplaint":"Breathlessness at rest, orthopnoea and increasing leg swelling"}},{"date":"2026-09-26","kind":"discharge-summary","service":"hospital","title":"Heart failure discharge","data":{"stage":"sent","sentAt":1790413200000,"sentBy":"Dr Lewis Grant","assignee":"duty GP","sections":{"course":"Admitted with worsening breathlessness, orthopnoea and peripheral oedema. Intravenous diuresis improved congestion, while renal function and electrolytes were checked.","reason":"Progressive breathlessness and weight gain with heart failure and CKD.","results":"Chest imaging showed pulmonary vascular congestion. Creatinine was above baseline and potassium required repeat testing.","followUp":"Cardiology and GP review requested within one week, with daily weights and safety-netting for worsening breathlessness.","diagnoses":"Acute on chronic heart failure with pulmonary congestion; CKD required close monitoring.","gpActions":"Review weight, oxygen saturation, fluid status and renal profile, and confirm home support.","medicationChanges":"Loop diuretic treatment was adjusted; check the discharge prescription and renal monitoring plan."}}},{"date":"2026-10-11","kind":"encounter","service":"gp","title":"Recurrent congestion review","data":{"text":"After discharge, breathlessness worsened with little urine and difficulty lying flat. Her daughter was asked to call an ambulance.","reason":"Recurrent heart failure symptoms","channel":"telephone"}},{"date":"2026-10-15","kind":"hospital-attendance","service":"hospital","title":"Severe pulmonary congestion attendance","data":{"stage":"arrived","acuity":"1","location":"Resuscitation area","arrivalAt":1792051200000,"clinician":"Unassigned","presentingComplaint":"Severe breathlessness at rest with inability to lie flat"}}]}];

const SIMULATOR_NON_MEDICAL_DEATH = {
  patientId: 'SIM-000009',
  deathDate: '2026-09-05',
  deathCause: 'Road traffic collision',
  birthDate: '1958-02-17',
  name: 'Synthetic road-traffic outcome',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readNdjson(file) {
  const text = fs.readFileSync(file, 'utf8');
  const rows = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${file}:${index + 1} is not valid JSON: ${error.message}`);
    }
  }
  return rows;
}

function writeNdjson(file, rows) {
  fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
}

function csvCell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseDateMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value) return NaN;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function isoDate(value) {
  const ms = parseDateMs(value);
  if (!Number.isFinite(ms)) throw new Error(`Invalid date: ${value}`);
  return new Date(ms).toISOString().slice(0, 10);
}

function minusDays(date, days) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

function cutoffEndMs(cutoffDate) {
  return Date.parse(`${cutoffDate}T23:59:59.999Z`);
}

function ageAt(birthDate, date) {
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const at = new Date(`${date}T00:00:00.000Z`);
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  if (
    at.getUTCMonth() < birth.getUTCMonth()
    || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate())
  ) age -= 1;
  return age;
}

function eventList(spec) {
  const events = spec.events ?? spec.timeline;
  if (!Array.isArray(events)) throw new Error(`Authored target ${spec.patientId} has no events/timeline array`);
  return events;
}

function eventStatus(kind) {
  switch (kind) {
    case 'report': return 'available';
    case 'discharge-summary': return 'sent';
    case 'hospital-attendance': return 'arrived';
    case 'hospital-note': return 'signed';
    case 'referral': return 'requested';
    case 'encounter':
    case 'observation':
    case 'visit':
      return 'completed';
    default:
      return 'completed';
  }
}

function eventPriority(kind, data) {
  if (kind === 'hospital-attendance' || kind === 'hospital-note') {
    const acuity = String(data?.acuity ?? '').toLowerCase();
    if (acuity === 'critical' || acuity === 'emergency' || acuity === '1' || acuity === 'urgent') return 'urgent';
  }
  return 'routine';
}

function eventVisibility(service) {
  switch (service) {
    case 'diagnostics': return ['diagnostics', 'gp', 'hospital'];
    case 'hospital': return ['hospital', 'gp'];
    case 'community': return ['community', 'gp'];
    case 'patient': return ['patient', 'gp'];
    case 'pharmacy': return ['pharmacy', 'gp', 'patient'];
    default: return [service];
  }
}

function convertEvent(spec, event, eventIndex) {
  const createdAt = parseDateMs(event.date);
  if (!Number.isFinite(createdAt)) throw new Error(`Invalid event date for ${spec.patientId}: ${event.date}`);
  const data = clone(event.data ?? {});
  if (event.text !== undefined && data.text === undefined) data.text = event.text;
  const suffix = String(eventIndex + 1).padStart(3, '0');
  return {
    id: `enriched-authored-${spec.patientId}-${suffix}`,
    data,
    kind: event.kind,
    owner: event.service,
    title: event.title,
    status: eventStatus(event.kind),
    version: 1,
    priority: eventPriority(event.kind, data),
    createdAt,
    patientId: spec.patientId,
    visibleTo: eventVisibility(event.service),
    provenance: {
      changes: [],
      created: {
        time: createdAt,
        actor: { kind: 'synthetic-authoring', name: 'mortality-cohort-enrichment builder' },
        action: 'author_plan_event',
        source: 'supplied-plan-artifact',
        version: 1,
      },
    },
  };
}

function sortResources(resources) {
  return [...resources].sort((a, b) => {
    const byTime = (a.createdAt ?? 0) - (b.createdAt ?? 0);
    return byTime || String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

function maxProvenanceChangeTime(resource) {
  const changes = resource?.provenance?.changes;
  if (!Array.isArray(changes)) return -Infinity;
  return Math.max(...changes.map((change) => parseDateMs(change.time)).filter(Number.isFinite), -Infinity);
}

// Temporal fields in resource payloads are event timestamps, not free-text dates.
const TEMPORAL_KEY = /^(date|time|createdAt|dueAt|receivedAt|sentAt|arrivalAt|collectedAt|issueDate|reviewDate|filedAt|reviewedAt|startsAt|at)$/i;

function collectTemporalTimes(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (TEMPORAL_KEY.test(key)) {
      const parsed = parseDateMs(child);
      if (Number.isFinite(parsed)) output.push(parsed);
    }
    if (child && typeof child === 'object') collectTemporalTimes(child, output);
  }
  return output;
}

function hasPostCutoffEvent(resource, cutoffMs) {
  const timestamps = collectTemporalTimes(resource);
  return timestamps.some((timestamp) => timestamp > cutoffMs);
}

const MODEL_MARKER_KEY = /^(?:resourceId|recordId|entryId|sourceId|patientId|synthetic|provenance|source|generator|generatedBy|audit|auditTrail|capturedAt|seenAtSites|calibration|laboratory|medicationProfile|profileVersion|variantReference|actor|action|author|death|deathDate|deathCause|deceased.*|mortality.*|outcome.*|label.*|eligible.*|ineligible.*)$/i;

function cleanModelString(key, value) {
  if (key !== 'title' || typeof value !== 'string') return value;
  return value
    .replace(/\s*[·-]\s*synthetic blood results\s*$/i, '')
    .replace(/^synthetic\s+/i, '')
    .trim();
}

function sanitizeModelValue(value, key = '') {
  if (Array.isArray(value)) return value.map((child) => sanitizeModelValue(child, key)).filter((child) => child !== undefined);
  if (!value || typeof value !== 'object') return cleanModelString(key, value);
  const output = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (MODEL_MARKER_KEY.test(childKey)) continue;
    const cleaned = sanitizeModelValue(childValue, childKey);
    if (cleaned !== undefined) output[childKey] = cleaned;
  }
  return output;
}

function sanitizeModelResource(resource) {
  // Top-level `id` and `patientId` identify the internal resource and are not
  // model features. Clinical coding IDs under panel/analyte/problem data are
  // retained because they describe the measurement, not the resource identity.
  const withoutJoinFields = { ...resource };
  delete withoutJoinFields.id;
  delete withoutJoinFields.patientId;
  return sanitizeModelValue(withoutJoinFields);
}

function buildModelRow(rawRecord, label) {
  const cutoffDate = minusDays(label.indexDate, label.horizonDays);
  const cutoffMs = cutoffEndMs(cutoffDate);
  const resources = rawRecord.resources
    .filter((resource) => Number.isFinite(resource.createdAt))
    .filter((resource) => resource.createdAt <= cutoffMs)
    .filter((resource) => maxProvenanceChangeTime(resource) <= cutoffMs)
    .filter((resource) => !hasPostCutoffEvent(resource, cutoffMs))
    .map(sanitizeModelResource);
  return {
    patientId: label.patientId,
    cutoffDate,
    horizonDays: label.horizonDays,
    demographics: {
      birthDate: rawRecord.directory.birthDate,
      ageAtIndex: ageAt(rawRecord.directory.birthDate, label.indexDate),
    },
    resources,
  };
}

function makeSyntheticTrueDeathRecord() {
  return {
    patientId: SIMULATOR_NON_MEDICAL_DEATH.patientId,
    capturedAt: SNAPSHOT_AT,
    directory: {
      id: SIMULATOR_NON_MEDICAL_DEATH.patientId,
      name: SIMULATOR_NON_MEDICAL_DEATH.name,
      birthDate: SIMULATOR_NON_MEDICAL_DEATH.birthDate,
      conditions: [],
      goals: [],
      needs: [],
      localIds: {
        gp: 'SYN-GP-000009',
        hospital: 'SYN-HOSP-000009',
      },
      death: {
        date: SIMULATOR_NON_MEDICAL_DEATH.deathDate,
        cause: SIMULATOR_NON_MEDICAL_DEATH.deathCause,
        source: SIMULATOR_TRUE_DEATH,
        synthetic: true,
      },
      synthetic: true,
    },
    resources: [],
  };
}

function loadBase() {
  const raw = readNdjson(path.join(BASE_DIR, 'raw-records.ndjson'));
  const labels = readNdjson(path.join(BASE_DIR, 'labels.ndjson'));
  const rawById = new Map(raw.map((record) => [record.patientId, record]));
  const labelById = new Map(labels.map((label) => [label.patientId, label]));
  if (rawById.size !== raw.length || labelById.size !== labels.length) throw new Error('Base cohort contains duplicate patient IDs');
  return { raw, labels, rawById, labelById };
}

function validatePlanSpecs(base) {
  if (AUTHORED_DEATHS.length !== TARGET_AUTHORED_DEATHS) {
    throw new Error(`Expected ${TARGET_AUTHORED_DEATHS} authored targets, found ${AUTHORED_DEATHS.length}`);
  }
  const seen = new Set();
  for (const spec of AUTHORED_DEATHS) {
    if (seen.has(spec.patientId)) throw new Error(`Duplicate authored target: ${spec.patientId}`);
    seen.add(spec.patientId);
    if (!base.rawById.has(spec.patientId)) throw new Error(`Authored target missing from preserved base cohort: ${spec.patientId}`);
    const events = eventList(spec);
    if (!events.length) throw new Error(`Authored target has no events: ${spec.patientId}`);
    for (const event of events) {
      if (!event.kind || !event.service || !event.title || !Number.isFinite(parseDateMs(event.date))) {
        throw new Error(`Malformed authored event for ${spec.patientId}`);
      }
    }
  }
  return seen;
}

function buildCohort() {
  const base = loadBase();
  const authoredIds = validatePlanSpecs(base);
  const baseTrueIds = base.labels.filter((label) => label.label === 1).map((label) => label.patientId);
  if (baseTrueIds.length !== 4) throw new Error(`Expected four preserved simulator deaths, found ${baseTrueIds.length}`);

  const controls = base.labels
    .filter((label) => label.label === 0)
    .map((label) => label.patientId)
    .filter((patientId) => !authoredIds.has(patientId) && patientId !== CONTROL_EXCLUDED_TO_FIT_TARGET);
  if (controls.length < TARGET_LIVING_CONTROLS) {
    throw new Error(`Only ${controls.length} base living controls remain after authored targets/exclusion`);
  }
  const selectedControls = controls.slice(0, TARGET_LIVING_CONTROLS);

  const deathDates = [
    ...baseTrueIds.map((patientId) => base.labelById.get(patientId).deathDate),
    SIMULATOR_NON_MEDICAL_DEATH.deathDate,
    ...AUTHORED_DEATHS.map((spec) => spec.deathDate),
  ].map(isoDate).sort();

  const entries = [
    ...baseTrueIds.map((patientId) => ({
      patientId,
      role: 'true-death',
      baseRecord: base.rawById.get(patientId),
      deathDate: isoDate(base.labelById.get(patientId).deathDate),
      deathCause: base.labelById.get(patientId).deathCause ?? base.rawById.get(patientId).directory.death?.cause ?? null,
      deathSource: SIMULATOR_TRUE_DEATH,
      labelSource: SIMULATOR_TRUE_DEATH,
      eligibleForMortalityLabel: true,
      medicallyEligibleDeath: true,
      deathObserved: true,
    })),
    {
      patientId: SIMULATOR_NON_MEDICAL_DEATH.patientId,
      role: 'true-death',
      baseRecord: makeSyntheticTrueDeathRecord(),
      deathDate: SIMULATOR_NON_MEDICAL_DEATH.deathDate,
      deathCause: SIMULATOR_NON_MEDICAL_DEATH.deathCause,
      deathSource: SIMULATOR_TRUE_DEATH,
      labelSource: `${SIMULATOR_TRUE_DEATH}-ineligible`,
      eligibleForMortalityLabel: false,
      medicallyEligibleDeath: false,
      deathObserved: true,
      ineligibleReason: INELIGIBLE_REASON,
    },
    ...AUTHORED_DEATHS.map((spec) => ({
      patientId: spec.patientId,
      role: 'authored-death',
      baseRecord: base.rawById.get(spec.patientId),
      spec,
      deathDate: isoDate(spec.deathDate),
      deathCause: spec.deathCause,
      deathSource: AUTHORED_DEATH,
      labelSource: AUTHORED_DEATH,
      eligibleForMortalityLabel: true,
      medicallyEligibleDeath: true,
      deathObserved: true,
    })),
    ...selectedControls.map((patientId, index) => ({
      patientId,
      role: 'living-control',
      baseRecord: base.rawById.get(patientId),
      deathDate: null,
      deathCause: null,
      deathSource: null,
      labelSource: LIVING_LABEL,
      eligibleForMortalityLabel: true,
      medicallyEligibleDeath: false,
      deathObserved: false,
      matchedControlDate: deathDates[index % deathDates.length],
    })),
  ];

  if (entries.length !== TARGET_PATIENTS) throw new Error(`Built ${entries.length} cohort entries, expected ${TARGET_PATIENTS}`);
  const ids = new Set(entries.map((entry) => entry.patientId));
  if (ids.size !== entries.length) throw new Error('Built cohort contains duplicate patient IDs');

  const labels = entries.map((entry, index) => ({
    patientId: entry.patientId,
    label: entry.eligibleForMortalityLabel && entry.deathObserved ? 1 : entry.deathObserved ? null : 0,
    deathObserved: entry.deathObserved,
    cohortRole: entry.role,
    labelSource: entry.labelSource,
    deathSource: entry.deathSource,
    eligibleForMortalityLabel: entry.eligibleForMortalityLabel,
    medicallyEligibleDeath: entry.medicallyEligibleDeath,
    ineligibleReason: entry.ineligibleReason ?? null,
    indexDate: entry.deathDate ?? entry.matchedControlDate,
    matchedControlDate: entry.matchedControlDate ?? null,
    deathDate: entry.deathDate,
    deathCause: entry.deathCause,
    conditionCountCurrentAuditOnly: entry.baseRecord.directory.conditions?.length ?? 0,
    fold: index % 5,
  }));

  const records = entries.map((entry) => {
    const directory = clone(entry.baseRecord.directory);
    const baseResources = clone(entry.baseRecord.resources ?? []);
    let resources = baseResources;
    if (entry.role === 'authored-death') {
      directory.death = {
        date: entry.deathDate,
        cause: entry.deathCause,
        source: AUTHORED_DEATH,
        synthetic: true,
      };
      resources = [
        ...baseResources,
        ...eventList(entry.spec).map((event, eventIndex) => convertEvent(entry.spec, event, eventIndex)),
      ];
    }
    return {
      patientId: entry.patientId,
      capturedAt: SNAPSHOT_AT,
      directory,
      resources: sortResources(resources),
    };
  });

  return { base, entries, labels, records, authoredIds, selectedControls, deathDates };
}

function forbiddenModelKey(key) {
  return MODEL_MARKER_KEY.test(key);
}

function walkKeys(value, callback, pathName = '$') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    callback(key, child, `${pathName}.${key}`);
    walkKeys(child, callback, `${pathName}.${key}`);
  }
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function validateCsvIndex(file, expectedIds) {
  const lines = fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/);
  const errors = [];
  assert(lines.length === TARGET_PATIENTS + 1, `${path.basename(file)} has ${lines.length - 1} data rows`, errors);
  const header = lines[0]?.split(',') ?? [];
  assert(header.includes('patient_id'), 'cohort-index.csv lacks patient_id column', errors);
  const ids = lines.slice(1).map((line) => line.split(',')[0]);
  assert(new Set(ids).size === ids.length, 'cohort-index.csv contains duplicate patient IDs', errors);
  assert(ids.every((id) => expectedIds.has(id)), 'cohort-index.csv has an unknown patient ID', errors);
  assert(ids.length === expectedIds.size, 'cohort-index.csv does not link exactly to label IDs', errors);
  return errors;
}

function validateOutput() {
  const errors = [];
  const labels = readNdjson(path.join(OUT_DIR, 'labels.ndjson'));
  const records = readNdjson(path.join(OUT_DIR, 'raw-records.ndjson'));
  const horizonRows = new Map(HORIZONS.map((horizon) => [horizon, readNdjson(path.join(OUT_DIR, `asof-${horizon}d.ndjson`))]));
  const pilotRows = readNdjson(path.join(OUT_DIR, PILOT_FILE));
  const allAuthored15dRows = readNdjson(path.join(OUT_DIR, ALL_AUTHORED_15D_FILE));
  const manifest = readJson(path.join(OUT_DIR, 'manifest.json'));
  const labelIds = new Set(labels.map((row) => row.patientId));
  const recordIds = new Set(records.map((row) => row.patientId));

  assert(labels.length === TARGET_PATIENTS, `labels.ndjson has ${labels.length} rows`, errors);
  assert(records.length === TARGET_PATIENTS, `raw-records.ndjson has ${records.length} rows`, errors);
  assert(labelIds.size === labels.length, 'labels.ndjson contains duplicate patient IDs', errors);
  assert(recordIds.size === records.length, 'raw-records.ndjson contains duplicate patient IDs', errors);
  assert([...labelIds].every((id) => recordIds.has(id)) && labelIds.size === recordIds.size, 'labels/raw patient links differ', errors);
  assert(labels.filter((row) => row.cohortRole === 'true-death').length === TARGET_TRUE_DEATHS, 'true death count mismatch', errors);
  assert(labels.filter((row) => row.cohortRole === 'authored-death').length === TARGET_AUTHORED_DEATHS, 'authored death count mismatch', errors);
  assert(labels.filter((row) => row.cohortRole === 'living-control').length === TARGET_LIVING_CONTROLS, 'living control count mismatch', errors);
  assert(labels.filter((row) => row.deathObserved).length === TARGET_TRUE_DEATHS + TARGET_AUTHORED_DEATHS, 'observed death count mismatch', errors);
  assert(labels.filter((row) => row.medicallyEligibleDeath).length === TARGET_ELIGIBLE_DEATHS, 'medically eligible death count mismatch', errors);
  assert(labels.filter((row) => row.label === 1).length === TARGET_ELIGIBLE_DEATHS, 'positive label count mismatch', errors);
  assert(labels.filter((row) => row.label === 0).length === TARGET_LIVING_CONTROLS, 'negative label count mismatch', errors);
  assert(labels.filter((row) => row.label === null).length === 1, 'ineligible death should be the only unlabeled row', errors);

  const excluded = labels.find((row) => row.patientId === SIMULATOR_NON_MEDICAL_DEATH.patientId);
  assert(Boolean(excluded), 'SIM-000009 is missing', errors);
  if (excluded) {
    assert(excluded.deathObserved === true, 'SIM-000009 is not marked as an observed death', errors);
    assert(excluded.eligibleForMortalityLabel === false, 'SIM-000009 is not marked ineligible', errors);
    assert(excluded.medicallyEligibleDeath === false, 'SIM-000009 is marked medically eligible', errors);
    assert(excluded.label === null, 'SIM-000009 must not receive a model label', errors);
  }

  const expectedIds = labelIds;
  errors.push(...validateCsvIndex(path.join(OUT_DIR, 'cohort-index.csv'), expectedIds));
  for (const [horizon, rows] of horizonRows) {
    assert(rows.length === TARGET_PATIENTS, `asof-${horizon}d.ndjson has ${rows.length} rows`, errors);
    const ids = new Set(rows.map((row) => row.patientId));
    assert(ids.size === rows.length, `asof-${horizon}d.ndjson contains duplicate patient IDs`, errors);
    assert(ids.size === expectedIds.size && [...expectedIds].every((id) => ids.has(id)), `asof-${horizon}d.ndjson patient links differ`, errors);
  }

  assert(pilotRows.length === PILOT_PATIENT_IDS.length, `${PILOT_FILE} has ${pilotRows.length} rows`, errors);
  assert(JSON.stringify(pilotRows.map((row) => row.patientId)) === JSON.stringify(PILOT_PATIENT_IDS), `${PILOT_FILE} patient IDs or order differ`, errors);
  for (const row of pilotRows) {
    const label = labels.find((candidate) => candidate.patientId === row.patientId);
    assert(Boolean(label), `${row.patientId} pilot row has no label`, errors);
    if (!label) continue;
    assert(row.horizonDays === PILOT_HORIZON_DAYS, `${row.patientId} pilot horizonDays mismatch`, errors);
    assert(row.cutoffDate === minusDays(label.indexDate, PILOT_HORIZON_DAYS), `${row.patientId} pilot cutoff mismatch`, errors);
    for (const resource of row.resources ?? []) {
      assert(resource.createdAt <= cutoffEndMs(row.cutoffDate), `${row.patientId} pilot contains a post-cutoff resource`, errors);
      assert(collectTemporalTimes(resource).every((timestamp) => timestamp <= cutoffEndMs(row.cutoffDate)), `${row.patientId} pilot contains a post-cutoff event`, errors);
      walkKeys(resource, (key, _child, keyPath) => {
        assert(!forbiddenModelKey(key), `${row.patientId} pilot model-visible marker ${keyPath}`, errors);
      });
    }
  }

  const authoredPatientIds = AUTHORED_DEATHS.map((spec) => spec.patientId);
  assert(allAuthored15dRows.length === TARGET_AUTHORED_DEATHS, `${ALL_AUTHORED_15D_FILE} has ${allAuthored15dRows.length} rows`, errors);
  assert(JSON.stringify(allAuthored15dRows.map((row) => row.patientId)) === JSON.stringify(authoredPatientIds), `${ALL_AUTHORED_15D_FILE} patient IDs or order differ`, errors);
  for (const row of allAuthored15dRows) {
    const label = labels.find((candidate) => candidate.patientId === row.patientId);
    assert(label?.labelSource === AUTHORED_DEATH, `${row.patientId} all-authored row is not an authored synthetic death`, errors);
    if (!label) continue;
    assert(row.horizonDays === PILOT_HORIZON_DAYS, `${row.patientId} all-authored horizonDays mismatch`, errors);
    assert(row.cutoffDate === minusDays(label.indexDate, PILOT_HORIZON_DAYS), `${row.patientId} all-authored cutoff mismatch`, errors);
  }

  const planById = new Map(AUTHORED_DEATHS.map((spec) => [spec.patientId, spec]));
  const allResourceIds = new Set();
  for (const record of records) {
    assert(record.patientId === record.directory?.id, `${record.patientId} directory link mismatch`, errors);
    assert(Array.isArray(record.resources), `${record.patientId} resources is not an array`, errors);
    const localIds = new Set();
    for (const resource of record.resources ?? []) {
      assert(resource.patientId === record.patientId, `${record.patientId} has a resource linked to ${resource.patientId}`, errors);
      assert(resource.id && !allResourceIds.has(resource.id), `duplicate resource ID: ${resource.id}`, errors);
      allResourceIds.add(resource.id);
      assert(!localIds.has(resource.id), `${record.patientId} has duplicate resource ID ${resource.id}`, errors);
      localIds.add(resource.id);
    }
    if (planById.has(record.patientId)) {
      const spec = planById.get(record.patientId);
      const authored = record.resources.filter((resource) => resource.id.startsWith(`enriched-authored-${record.patientId}-`));
      assert(authored.length === eventList(spec).length, `${record.patientId} authored target coverage mismatch`, errors);
      assert(record.directory.death?.date === isoDate(spec.deathDate), `${record.patientId} authored death date link mismatch`, errors);
      assert(record.directory.death?.cause === spec.deathCause, `${record.patientId} authored death cause link mismatch`, errors);
    }
  }
  assert(allResourceIds.size === records.reduce((count, record) => count + record.resources.length, 0), 'raw resource IDs are not globally unique', errors);

  for (const [horizon, rows] of horizonRows) {
    let totalResources = 0;
    const counts = [];
    for (const row of rows) {
      const label = labels.find((candidate) => candidate.patientId === row.patientId);
      assert(Boolean(label), `${row.patientId} horizon row has no label`, errors);
      if (!label) continue;
      const expectedCutoff = minusDays(label.indexDate, horizon);
      assert(row.cutoffDate === expectedCutoff, `${row.patientId} ${horizon}d cutoff mismatch`, errors);
      assert(row.horizonDays === horizon, `${row.patientId} horizonDays mismatch`, errors);
      assert(Array.isArray(row.resources), `${row.patientId} ${horizon}d resources is not an array`, errors);
      assert(row.resources.length <= MAX_RESOURCES_PER_PATIENT, `${row.patientId} exceeds per-patient resource bound`, errors);
      totalResources += row.resources.length;
      counts.push(row.resources.length);
      for (const resource of row.resources ?? []) {
        assert(!Object.hasOwn(resource, 'id'), `${row.patientId} ${horizon}d exposes an internal resource ID`, errors);
        assert(!Object.hasOwn(resource, 'patientId'), `${row.patientId} ${horizon}d exposes a resource patientId`, errors);
        assert(Number.isFinite(resource.createdAt), `${row.patientId} ${horizon}d resource lacks createdAt`, errors);
        assert(resource.createdAt <= cutoffEndMs(row.cutoffDate), `${row.patientId} ${horizon}d contains a post-cutoff resource`, errors);
        walkKeys(resource, (key, _child, keyPath) => {
          assert(!forbiddenModelKey(key), `${row.patientId} ${horizon}d model-visible marker ${keyPath}`, errors);
        });
        const timestamps = collectTemporalTimes(resource);
        assert(timestamps.every((timestamp) => timestamp <= cutoffEndMs(row.cutoffDate)), `${row.patientId} ${horizon}d contains a post-cutoff event`, errors);
      }
    }
    assert(totalResources <= MAX_RESOURCES_TOTAL, `${horizon}d total resources exceed bound`, errors);
  }

  assert(manifest.syntheticDataOnly === true, 'manifest does not mark data synthetic-only', errors);
  assert(manifest.inventedSyntheticAugmentation === true, 'manifest does not mark augmentation as invented synthetic data', errors);
  assert(manifest.cohort?.patientCount === TARGET_PATIENTS, 'manifest patient count mismatch', errors);
  assert(manifest.cohort?.trueDeaths === TARGET_TRUE_DEATHS, 'manifest true death count mismatch', errors);
  assert(manifest.cohort?.authoredDeaths === TARGET_AUTHORED_DEATHS, 'manifest authored death count mismatch', errors);
  assert(manifest.cohort?.livingControls === TARGET_LIVING_CONTROLS, 'manifest living control count mismatch', errors);
  assert(manifest.cohort?.medicallyEligibleDeaths === TARGET_ELIGIBLE_DEATHS, 'manifest eligible death count mismatch', errors);

  if (errors.length) throw new Error(`Enriched cohort validation failed:\n- ${errors.join('\n- ')}`);

  const horizonSummary = {};
  for (const [horizon, rows] of horizonRows) {
    const counts = rows.map((row) => row.resources.length);
    horizonSummary[`${horizon}d`] = {
      patients: rows.length,
      cutoffDates: [...new Set(rows.map((row) => row.cutoffDate))].sort(),
      resourceCount: counts.reduce((sum, count) => sum + count, 0),
      minResources: Math.min(...counts),
      maxResources: Math.max(...counts),
      medianResources: median(counts),
    };
  }
  return {
    patients: labels.length,
    trueDeaths: labels.filter((row) => row.cohortRole === 'true-death').length,
    authoredDeaths: labels.filter((row) => row.cohortRole === 'authored-death').length,
    livingControls: labels.filter((row) => row.cohortRole === 'living-control').length,
    observedDeaths: labels.filter((row) => row.deathObserved).length,
    medicallyEligibleDeaths: labels.filter((row) => row.medicallyEligibleDeath).length,
    targetCoverage: AUTHORED_DEATHS.length,
    resources: allResourceIds.size,
    horizonSummary,
  };
}

function build() {
  const { labels, records, authoredIds, selectedControls, deathDates } = buildCohort();
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  writeNdjson(path.join(OUT_DIR, 'labels.ndjson'), labels);
  writeNdjson(path.join(OUT_DIR, 'raw-records.ndjson'), records);

  const pilotRows = PILOT_PATIENT_IDS.map((patientId) => {
    const label = labels.find((candidate) => candidate.patientId === patientId);
    const record = records.find((candidate) => candidate.patientId === patientId);
    if (!label || !record) throw new Error(`Pilot patient ${patientId} is missing from the enriched cohort`);
    return buildModelRow(record, { ...label, horizonDays: PILOT_HORIZON_DAYS });
  });
  writeNdjson(path.join(OUT_DIR, PILOT_FILE), pilotRows);

  const authoredLabels = new Map(labels.map((label) => [label.patientId, label]));
  const authoredRecords = new Map(records.map((record) => [record.patientId, record]));
  const allAuthored15dRows = AUTHORED_DEATHS.map(({ patientId }) => {
    const label = authoredLabels.get(patientId);
    const record = authoredRecords.get(patientId);
    if (!label || !record) throw new Error(`Authored patient ${patientId} is missing from the enriched cohort`);
    return buildModelRow(record, { ...label, horizonDays: PILOT_HORIZON_DAYS });
  });
  writeNdjson(path.join(OUT_DIR, ALL_AUTHORED_15D_FILE), allAuthored15dRows);

  const horizonCoverage = {};
  for (const horizon of HORIZONS) {
    const rows = labels.map((label) => buildModelRow(records.find((record) => record.patientId === label.patientId), { ...label, horizonDays: horizon }));
    writeNdjson(path.join(OUT_DIR, `asof-${horizon}d.ndjson`), rows);
    const counts = rows.map((row) => row.resources.length);
    horizonCoverage[`${horizon}d`] = {
      patients: rows.length,
      cutoffDates: [...new Set(rows.map((row) => row.cutoffDate))].sort(),
      resourceCount: counts.reduce((sum, count) => sum + count, 0),
      minResources: Math.min(...counts),
      maxResources: Math.max(...counts),
      medianResources: median(counts),
    };
  }

  const indexHeader = [
    'patient_id',
    'label',
    'death_observed',
    'cohort_role',
    'label_source',
    'death_source',
    'eligible_for_mortality_label',
    'medically_eligible_death',
    'ineligible_reason',
    'index_date',
    'matched_control_date',
    'death_date',
    'death_cause',
    'condition_count_current_audit_only',
    'fold',
  ];
  const indexRows = labels.map((label) => [
    label.patientId,
    label.label,
    label.deathObserved,
    label.cohortRole,
    label.labelSource,
    label.deathSource,
    label.eligibleForMortalityLabel,
    label.medicallyEligibleDeath,
    label.ineligibleReason,
    label.indexDate,
    label.matchedControlDate,
    label.deathDate,
    label.deathCause,
    label.conditionCountCurrentAuditOnly,
    label.fold,
  ]);
  fs.writeFileSync(path.join(OUT_DIR, 'cohort-index.csv'), `${[indexHeader, ...indexRows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`);

  const authoredEventCounts = Object.fromEntries(AUTHORED_DEATHS.map((spec) => [spec.patientId, eventList(spec).length]));
  const manifest = {
    schemaVersion: 2,
    dataset: 'mortality-cohort-enriched',
    syntheticDataOnly: true,
    inventedSyntheticAugmentation: true,
    generatedAt: SNAPSHOT_AT,
    source: {
      baseCohort: 'data/mortality-cohort',
      baseSnapshotAt: BASE_SNAPSHOT_AT,
      authoredPlanArtifacts: ['ten-a.json', 'ten-b.json', 'ten-c.json', 'four-d.json'],
      authoredPlanTargetsEmbeddedInBuilder: true,
      liveApiCalled: false,
      liveApiMutated: false,
    },
    cohort: {
      patientCount: TARGET_PATIENTS,
      trueDeaths: TARGET_TRUE_DEATHS,
      authoredDeaths: TARGET_AUTHORED_DEATHS,
      observedDeaths: TARGET_TRUE_DEATHS + TARGET_AUTHORED_DEATHS,
      livingControls: TARGET_LIVING_CONTROLS,
      medicallyEligibleDeaths: TARGET_ELIGIBLE_DEATHS,
      excludedFromMortalityLabel: 1,
      ineligibleDeaths: [{ patientId: SIMULATOR_NON_MEDICAL_DEATH.patientId, cause: SIMULATOR_NON_MEDICAL_DEATH.deathCause, reason: INELIGIBLE_REASON }],
      authoredDeathTargets: [...authoredIds],
      authoredEventCounts,
      controlsExcludedToFitTarget: [CONTROL_EXCLUDED_TO_FIT_TARGET],
      selectedLivingControlIds: selectedControls,
      labelCounts: { positive: TARGET_ELIGIBLE_DEATHS, negative: TARGET_LIVING_CONTROLS, unlabeledIneligibleDeath: 1 },
      indexDatePolicy: 'Each death uses its death date. Living controls use a deterministic round-robin match to the sorted 39 observed death dates.',
      matchedDeathDates: deathDates,
      labelProvenance: {
        trueDeaths: 'Simulator-recorded death outcomes copied from the preserved base audit; SIM-000009 is retained but ineligible because its cause is non-medical.',
        authoredDeaths: 'Invented synthetic death outcomes and event timelines supplied as compact plan specifications; these are not simulator observations.',
        livingControls: 'No death outcome in the preserved base snapshot; right-censored controls, not guaranteed never to die later.',
      },
    },
    modelInputs: {
      recommended: 'asof-90d.ndjson',
      horizonsDays: HORIZONS,
      pilot: {
        file: PILOT_FILE,
        horizonDays: PILOT_HORIZON_DAYS,
        patientIds: PILOT_PATIENT_IDS,
        rowCount: PILOT_PATIENT_IDS.length,
        purpose: 'Synthetic pipeline development only; not clinical evidence or simulator-observed outcomes.',
      },
      allAuthored15d: {
        file: ALL_AUTHORED_15D_FILE,
        horizonDays: PILOT_HORIZON_DAYS,
        scope: 'All 34 authored synthetic death targets only; excludes simulator-recorded deaths and living controls.',
        rowCount: TARGET_AUTHORED_DEATHS,
        syntheticOnly: true,
        limitation: 'Invented synthetic data for pipeline development only; not clinical evidence or simulator-observed outcomes.',
      },
      labelFile: 'labels.ndjson',
      rawAuditFile: 'raw-records.ndjson',
      rule: 'Per-patient cutoff is index date minus horizon. Include only resources created by cutoff, with no provenance change or nested event timestamp after cutoff.',
      modelVisibleFields: 'patientId is retained only as the row join key; demographics and sanitized simulator-shaped resources are retained.',
      removedFromInputs: ['outcomes', 'generator markers', 'audit markers', 'source markers', 'provenance', 'internal top-level resource IDs', 'resource patientId join fields'],
      limitations: [
        'The API cannot reconstruct historical versions; resources changed after a cutoff are excluded rather than rewritten.',
        'The 34 authored deaths are invented synthetic augmentation and must not be presented as observed clinical outcomes.',
        'Only 38 of 39 observed deaths are medically eligible for the mortality label; SIM-000009 is excluded from positive/negative evaluation.',
        'Controls are alive at the preserved base snapshot only and are right-censored.',
      ],
    },
    validation: {
      command: 'node scripts/build-enriched-mortality-cohort.mjs --validate',
      checks: ['exact cohort counts', 'unique patient IDs', '34 authored target coverage', 'exact 15-day pilot IDs and row count', 'exact all-authored 15-day IDs, order, row count, and authored-only scope', 'per-patient, pilot, and all-authored cutoff dates', 'cross-file links', 'no post-cutoff events', 'no model-visible outcome/provenance/generator fields', 'valid NDJSON', 'bounded resource counts'],
      bounds: { maxResourcesPerPatient: MAX_RESOURCES_PER_PATIENT, maxResourcesTotalPerHorizon: MAX_RESOURCES_TOTAL },
    },
    horizonCoverage,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const readme = [
    '# Enriched synthetic mortality cohort',
    '',
    'This is a deterministic, pipeline-development-only augmentation of the preserved data/mortality-cohort/ snapshot. The augmentation is INVENTED SYNTHETIC DATA, not a live simulator observation and not a clinical label. The builder makes no API calls and does not mutate the simulator.',
    '',
    '## Cohort',
    '',
    '- 100 unique patients',
    '- 5 simulator-recorded deaths, including SIM-000009 (road-traffic collision) retained as ineligible',
    '- 34 invented synthetic authored deaths from the four supplied compact plan artifacts',
    '- 39 observed deaths in the combined audit, of which 38 are medically eligible',
    '- 61 living controls',
    '',
    'SIM-000009 has an observed death but receives no mortality model label (label: null) because the cause is non-medical. The 34 authored deaths receive labelSource: authored-synthetic-mortality-v2; the five simulator-recorded outcomes are separately identified in labels.ndjson.',
    '',
    '## Files',
    '',
    '| File | Purpose |',
    '|---|---|',
    '| cohort-index.csv | Human-readable roles, label provenance, index dates and audit-only outcome metadata. |',
    '| labels.ndjson | Machine-readable labels and provenance, kept separate from model inputs. |',
    '| raw-records.ndjson | Combined audit records, including outcomes and generator/provenance markers; never feed directly to a model. |',
    '| asof-90d.ndjson | Recommended model input with per-patient 90-day cutoffs. |',
    '| asof-60d.ndjson | Model input at the 60-day horizon. |',
    '| asof-30d.ndjson | Model input at the 30-day horizon. |',
    `| ${PILOT_FILE} | Three-row 15-day-cutoff pilot for SIM-000499, SIM-000472, and SIM-000464; invented synthetic data for pipeline development only. |`,
    `| ${ALL_AUTHORED_15D_FILE} | All 34 authored synthetic death targets at a 15-day cutoff; excludes simulator-recorded deaths and living controls. Synthetic pipeline-development data only. |`,
    '| manifest.json | Deterministic source, selection, provenance, coverage and validation metadata. |',
    '',
    'The standard cohort NDJSON files have one row per patient and join on the top-level patientId. Controls use deterministic matched dates drawn round-robin from the sorted observed death dates; cases use their own death dates. Therefore each horizon has per-patient cutoffs rather than one shared cutoff. The clearly named pilot file contains exactly the three documented authored-death patients at death date minus 15 days. The all-authored 15-day file contains exactly all 34 authored synthetic death targets and no simulator-recorded deaths or living controls; it is synthetic-only and must not be treated as observed clinical evidence.',
    '',
    '## Model-input leakage policy',
    '',
    'For each row, resources are retained only when their createdAt and all event timestamps are on or before that patient\'s horizon cutoff. A resource with a later provenance change is excluded because the base API snapshot cannot reconstruct its historical payload. Model inputs remove outcomes, generator/audit/source/provenance markers, internal top-level resource IDs, and resource-level patientId; the row-level patientId remains only as a join key. Clinical coding IDs nested in measurement/problem data remain because they describe the clinical value rather than the resource identity.',
    '',
    '## Validation and rebuild',
    '',
    'From the repository root:',
    '',
    '    node scripts/build-enriched-mortality-cohort.mjs',
    '    node scripts/build-enriched-mortality-cohort.mjs --validate',
    '',
    'The deterministic validation checks exact role counts, uniqueness, all 34 authored targets, exact pilot IDs/order/row count, exact all-authored 15-day membership and scope, 15-day cutoff dates, cross-file links, no post-cutoff events, absence of model-visible outcome/provenance/generator fields, valid NDJSON and bounded resource counts. The preserved data/mortality-cohort/ directory is read-only input and is not rewritten.'
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), `${readme}\n`);

  const validation = validateOutput();
  console.log(JSON.stringify({ ...validation, output: OUT_DIR }, null, 2));
}

if (process.argv.includes('--validate') || process.argv.includes('--check')) {
  const validation = validateOutput();
  console.log(JSON.stringify(validation, null, 2));
} else {
  build();
}
