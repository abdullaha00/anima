# Overview

This describes how we use data input from wide range of sources in the anima simulated environment to create initially a signal, using ML methods, that flags a patient is likely to die and needs a conversation about palliative care with their team. This then triggers a second stage, an agent traverses the health record and verifies this is an appropriate decision. It then identifies key members of care team who need to be involved and organises and prepares a discussion.

# Stage 1 - ML
- LLM preprocessing to generates features from free text.
- Then a ML model to output a signal 
- Define a threshold for escalation
- We lean towards sensitivity over specificity, minimise FN, Stage 2 + human review will catch FP.

# Stage 2 - Agent
- Tool access to record
- Verifies the Stage 1 output
- Once confident it identifies to key members of patients care team to involve in the meeting.      
    - This prioritises speed, core members only so the meeting can happen fast
    - Determining ownership is crucial. The patient may be in hospital, at home, care home etc. In the NHS there is no centralised ownership of these decisions. A rare disease pt with a tertiary specialist needs to have the convo with them. A patient with low mobility and QDS care needs a home visit from GP or community care team.
    - It needs to identify the current care baseline support of the patient, this matters a lot, if a patient lives with family or has exisiting carers then it is much easier
    - It should identify the key signals that led to the palliative discussion being required.
    - Identifies any previous opinions or decisions from patient or family regarding end of life. ADRT, DNR etc must be identified and respected. 
    - Prepares notes for the meeting
    - Suggest next immediate actions.

# Data availability