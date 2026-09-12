# NHS-SIM API notes
Probed 2026-09-12T12:16:49.240Z against https://sim.animahealth.com

## Authentication
- Bearer: 200
- X-API-Key: 401
- api-key: 401
- Authorization-raw: 200
- X-Api-Token: 401

**Using: Bearer**

## Endpoints

### `GET /api/clock`  →  200

```
  now: number  e.g. 1789200000000
  paused: boolean  e.g. true
  speed: number  e.g. 60
  events: array[1] of       id: string  e.g. "e-3832"
      time: number  e.g. 1789200000000
      type: string  e.g. "connect_device"
      actor: string  e.g. "team2"
      detail: string  e.g. "Home activity watch"
      patientId: string  e.g. "SIM-000007"
      visibleTo: array[3] of string
      resourceId: string  e.g. "r-3831"
```

### `GET /api/sites/gp/patients`  →  200

```
  total: number  e.g. 50000
  items: array[30] of       id: string  e.g. "SIM-000001"
      name: string  e.g. "Amira Khan"
      goals: array[3] of string
      needs: array[2] of string
      localIds: object { gp, legacy, hospital }
      birthDate: string  e.g. "1952-05-12"
      synthetic: boolean  e.g. true
      conditions: array[2] of string
```

First record:

```json
{
  "id": "SIM-000001",
  "name": "Amira Khan",
  "goals": [
    "Understand the next step",
    "Avoid unnecessary travel",
    "Stay at home with a clear contact for help"
  ],
  "needs": [
    "Home visit",
    "Carer involvement"
  ],
  "localIds": {
    "gp": "RIV-0",
    "legacy": "WH-90000",
    "hospital": "NBG-10000"
  },
  "birthDate": "1952-05-12",
  "synthetic": true,
  "conditions": [
    "Heart failure",
    "CKD"
  ]
}
```

### `GET /api/sites/hospital/patients`  →  200

```
  total: number  e.g. 50000
  items: array[30] of       id: string  e.g. "SIM-000001"
      name: string  e.g. "Amira Khan"
      goals: array[3] of string
      needs: array[2] of string
      localIds: object { gp, legacy, hospital }
      birthDate: string  e.g. "1952-05-12"
      synthetic: boolean  e.g. true
      conditions: array[2] of string
```

First record:

```json
{
  "id": "SIM-000001",
  "name": "Amira Khan",
  "goals": [
    "Understand the next step",
    "Avoid unnecessary travel",
    "Stay at home with a clear contact for help"
  ],
  "needs": [
    "Home visit",
    "Carer involvement"
  ],
  "localIds": {
    "gp": "RIV-0",
    "legacy": "WH-90000",
    "hospital": "NBG-10000"
  },
  "birthDate": "1952-05-12",
  "synthetic": true,
  "conditions": [
    "Heart failure",
    "CKD"
  ]
}
```

### `GET /api/sites/hospital/attendances`  →  200

```
  resources: array[8] of       id: string  e.g. "hospital-attendance-seed-0"
      data: object { stage, acuity, location, arrivalAt, clinician, presentingComplaint }
      kind: string  e.g. "hospital-attendance"
      owner: string  e.g. "hospital"
      title: string  e.g. "Breathlessness"
      status: string  e.g. "waiting"
      version: number  e.g. 1
      priority: string  e.g. "urgent"
      createdAt: number  e.g. 1789197900000
      patientId: string  e.g. "SIM-000001"
      visibleTo: array[1] of string
      provenance: object { changes, created }
  patients: array[8] of       id: string  e.g. "SIM-000001"
      name: string  e.g. "Amira Khan"
      goals: array[3] of string
      needs: array[2] of string
      localIds: object { gp, legacy, hospital }
      birthDate: string  e.g. "1952-05-12"
      synthetic: boolean  e.g. true
      conditions: array[2] of string
  now: number  e.g. 1789200000000
```

First record:

```json
{
  "id": "SIM-000001",
  "name": "Amira Khan",
  "goals": [
    "Understand the next step",
    "Avoid unnecessary travel",
    "Stay at home with a clear contact for help"
  ],
  "needs": [
    "Home visit",
    "Carer involvement"
  ],
  "localIds": {
    "gp": "RIV-0",
    "legacy": "WH-90000",
    "hospital": "NBG-10000"
  },
  "birthDate": "1952-05-12",
  "synthetic": true,
  "conditions": [
    "Heart failure",
    "CKD"
  ]
}
```

### `GET /api/nhs/pds`  →  200

```
  resourceType: string  e.g. "Bundle"
  type: string  e.g. "searchset"
  total: number  e.g. 50000
  entry: array[30] of       resource: object { resourceType, id, identifier, name, birthDate, meta }
```

### `GET /api/nhs/eps`  →  200

```
  resourceType: string  e.g. "Bundle"
  type: string  e.g. "searchset"
  total: number  e.g. 1
  entry: array[1] of       resource: object { resourceType, id, status, subject, description, extension, meta }
```

### `GET /api/openapi.json`  →  200

```
  openapi: string  e.g. "3.1.0"
  info:     title: string  e.g. "NHS-SIM API"
    version: string  e.g. "1.0.0"
    description: string  e.g. "Synthetic healthcare simulation APIs. Start with POST /api/
  servers: array[1] of       url: string  e.g. "/"
      description: string  e.g. "This deployment (same origin)"
  tags: array[13] of       name: string  e.g. "Discovery"
  paths:     /healthz:       get: object { operationId, tags, summary, security, responses }
    /api/catalogue:       get: object { operationId, tags, summary, security, responses }
    /api/telephony/live:       get: object { operationId, tags, summary, security, description, responses }
    /openapi.json:       get: object { operationId, tags, summary, security, responses }
    /api/openapi.json:       get: object { operationId, tags, summary, security, responses }
    /api/keys:       post: object { operationId, tags, summary, security, requestBody, responses, description }
    /api/team:       get: object { operationId, tags, summary, security, responses, parameters }
    /api/session:       post: object { operationId, tags, summary, security, requestBody, responses, description }
    /api/clock:       get: object { operationId, tags, summary, security, responses, parameters }
      post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/plan-lab:       get: object { operationId, tags, summary, security, responses, deprecated }
    /api/sites/{site}/view:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/{site}/patients:       get: object { operationId, tags, summary, security, responses, parameters }
    /api/sites/{site}/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/sites/{site}/appointments:       get: object { operationId, tags, summary, security, responses, parameters }
    /api/sites/hospital/attendances:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/hospital/documents:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/gp/documents:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/pharmacy/pharmacy-workspace:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/gp/messaging-workspace:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/patient/messaging-workspace:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/wearables/devices:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/wearables/readings:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/pds:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/pds/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/ods:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/ods/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/dos:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/dos/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/ers:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/ers/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/eps:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/eps/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/eps-tracker:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/eps-tracker/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/gp-connect:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/gp-connect/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/mesh:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/mesh/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/scr:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/scr/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
  components:     securitySchemes:       TeamKey: object { type, scheme, description }
      OperatorKey: object { type, scheme, description }
      BrowserSession: object { type, in, name, description }
      CIS2AccessToken: object { type, scheme, description }
    schemas:       WearableDeviceData: object { type, properties, additionalProperties }
      WearableReadingData: object { type, properties, required, additionalProperties }
      WearableDevice: object { allOf }
      WearableReading: object { allOf }
      WearableDevicesPage: object { type, properties, required }
      WearableReadingsPage: object { type, properties, required }
      TelephonyClientMessage: object { oneOf }
      TelephonyServerMessage: object { oneOf }
      Error: object { type, properties, required }
      Action: object { type, properties, required, description }
      HospitalNote: object { oneOf }
      MedicationOrder: object { type, properties, required }
      BloodTestOrder: object { type, properties, required }
      Patient: object { type, properties, required }
      RecordChange: object { type, properties, required }
      Resource: object { type, properties, required }
      Event: object { type, properties, required }
      Clock: object { type, properties, required }
      Workspace: object { type, properties, required }
      View: object { type, properties, required }
      Team: object { type, properties, required }
      OperatorTeam: object { type, properties, required }
      OperatorLogging: object { type, properties, required }
      OperatorRequest: object { type, properties, required }
      OperatorChange: object { type, properties, required }
      OperatorActivity: object { type, properties, required }
      Key: object { type, properties, required }
      Bundle: object { type, properties, required }
      FhirPatient: object { type, properties, required }
      FhirOrganization: object { type, properties, required }
      OperationOutcome: object { type, properties, required }
      Cis2Settings: object { type, properties, required, additionalProperties }
      StaffIdentity: object { type, properties, required }
      Cis2Configuration: object { type, properties, required }
  x-site-registry: array[6] of       id: string  e.g. "control"
      name: string  e.g. "The neighbourhood"
```

### `GET /openapi.json`  →  200

```
  openapi: string  e.g. "3.1.0"
  info:     title: string  e.g. "NHS-SIM API"
    version: string  e.g. "1.0.0"
    description: string  e.g. "Synthetic healthcare simulation APIs. Start with POST /api/
  servers: array[1] of       url: string  e.g. "/"
      description: string  e.g. "This deployment (same origin)"
  tags: array[13] of       name: string  e.g. "Discovery"
  paths:     /healthz:       get: object { operationId, tags, summary, security, responses }
    /api/catalogue:       get: object { operationId, tags, summary, security, responses }
    /api/telephony/live:       get: object { operationId, tags, summary, security, description, responses }
    /openapi.json:       get: object { operationId, tags, summary, security, responses }
    /api/openapi.json:       get: object { operationId, tags, summary, security, responses }
    /api/keys:       post: object { operationId, tags, summary, security, requestBody, responses, description }
    /api/team:       get: object { operationId, tags, summary, security, responses, parameters }
    /api/session:       post: object { operationId, tags, summary, security, requestBody, responses, description }
    /api/clock:       get: object { operationId, tags, summary, security, responses, parameters }
      post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/plan-lab:       get: object { operationId, tags, summary, security, responses, deprecated }
    /api/sites/{site}/view:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/{site}/patients:       get: object { operationId, tags, summary, security, responses, parameters }
    /api/sites/{site}/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/sites/{site}/appointments:       get: object { operationId, tags, summary, security, responses, parameters }
    /api/sites/hospital/attendances:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/hospital/documents:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/gp/documents:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/pharmacy/pharmacy-workspace:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/gp/messaging-workspace:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/patient/messaging-workspace:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/wearables/devices:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/sites/wearables/readings:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/pds:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/pds/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/ods:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/ods/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/dos:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/dos/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/ers:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/ers/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/eps:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/eps/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/eps-tracker:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/eps-tracker/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/gp-connect:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/gp-connect/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/mesh:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/mesh/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
    /api/nhs/scr:       get: object { operationId, tags, summary, security, responses, parameters, description }
    /api/nhs/scr/actions:       post: object { operationId, tags, summary, security, requestBody, responses, parameters, description }
  components:     securitySchemes:       TeamKey: object { type, scheme, description }
      OperatorKey: object { type, scheme, description }
      BrowserSession: object { type, in, name, description }
      CIS2AccessToken: object { type, scheme, description }
    schemas:       WearableDeviceData: object { type, properties, additionalProperties }
      WearableReadingData: object { type, properties, required, additionalProperties }
      WearableDevice: object { allOf }
      WearableReading: object { allOf }
      WearableDevicesPage: object { type, properties, required }
      WearableReadingsPage: object { type, properties, required }
      TelephonyClientMessage: object { oneOf }
      TelephonyServerMessage: object { oneOf }
      Error: object { type, properties, required }
      Action: object { type, properties, required, description }
      HospitalNote: object { oneOf }
      MedicationOrder: object { type, properties, required }
      BloodTestOrder: object { type, properties, required }
      Patient: object { type, properties, required }
      RecordChange: object { type, properties, required }
      Resource: object { type, properties, required }
      Event: object { type, properties, required }
      Clock: object { type, properties, required }
      Workspace: object { type, properties, required }
      View: object { type, properties, required }
      Team: object { type, properties, required }
      OperatorTeam: object { type, properties, required }
      OperatorLogging: object { type, properties, required }
      OperatorRequest: object { type, properties, required }
      OperatorChange: object { type, properties, required }
      OperatorActivity: object { type, properties, required }
      Key: object { type, properties, required }
      Bundle: object { type, properties, required }
      FhirPatient: object { type, properties, required }
      FhirOrganization: object { type, properties, required }
      OperationOutcome: object { type, properties, required }
      Cis2Settings: object { type, properties, required, additionalProperties }
      StaffIdentity: object { type, properties, required }
      Cis2Configuration: object { type, properties, required }
  x-site-registry: array[6] of       id: string  e.g. "control"
      name: string  e.g. "The neighbourhood"
```

`GET /api/docs`  →  404 (not present)
`GET /api/health`  →  404 (not present)
`GET /api/sites/gp/encounters`  →  404 (not present)
`GET /api/sites/gp/observations`  →  404 (not present)
`GET /api/sites/gp/conditions`  →  404 (not present)
### `GET /api/sites/community/patients`  →  200

```
  total: number  e.g. 50000
  items: array[30] of       id: string  e.g. "SIM-000001"
      name: string  e.g. "Amira Khan"
      goals: array[3] of string
      needs: array[2] of string
      localIds: object { gp, legacy, hospital }
      birthDate: string  e.g. "1952-05-12"
      synthetic: boolean  e.g. true
      conditions: array[2] of string
```

First record:

```json
{
  "id": "SIM-000001",
  "name": "Amira Khan",
  "goals": [
    "Understand the next step",
    "Avoid unnecessary travel",
    "Stay at home with a clear contact for help"
  ],
  "needs": [
    "Home visit",
    "Carer involvement"
  ],
  "localIds": {
    "gp": "RIV-0",
    "legacy": "WH-90000",
    "hospital": "NBG-10000"
  },
  "birthDate": "1952-05-12",
  "synthetic": true,
  "conditions": [
    "Heart failure",
    "CKD"
  ]
}
```

`GET /api/staff`  →  404 (not present)
`GET /api/sites/gp/staff`  →  404 (not present)

## Fields Cairn needs, and whether they are here

- **found**  patient id  →  id
- **found**  age or date of birth  →  age, birthDate
- **found**  conditions or problem list  →  conditions, problems
- **found**  admissions or attendances  →  attendances
- MISSING  medications
- MISSING  frailty
- MISSING  deprivation
- **found**  free text notes  →  consultation, text, summary
- MISSING  existing ACP or ReSPECT
- MISSING  palliative register
- **found**  care team or staff  →  team, staff, clinician, gp, practitioner
- MISSING  contacts or next of kin

Anything MISSING means the matching indicator cannot fire, or the feature needs a
different source. Decide explicitly; do not invent the field.

All keys seen, for reference:

```
/api/catalogue, /api/clock, /api/control/agents, /api/control/incidents, /api/control/incidents/all, /api/control/model-propose, /api/control/population, /api/control/population/attach, /api/control/population/publish, /api/control/snapshot, /api/control/teams, /api/control/teams/delete, /api/control/teams/{world}, /api/control/teams/{world}/activity, /api/control/teams/{world}/session, /api/control/worlds, /api/keys, /api/nhs/appointments, /api/nhs/appointments/actions, /api/nhs/dos, /api/nhs/dos/actions, /api/nhs/eps, /api/nhs/eps-tracker, /api/nhs/eps-tracker/actions, /api/nhs/eps/actions, /api/nhs/ers, /api/nhs/ers/actions, /api/nhs/gp-connect, /api/nhs/gp-connect/actions, /api/nhs/mesh, /api/nhs/mesh/actions, /api/nhs/ods, /api/nhs/ods/actions, /api/nhs/ods/metadata, /api/nhs/ods/organization, /api/nhs/ods/organization/{id}, /api/nhs/pathology, /api/nhs/pathology/actions, /api/nhs/pds, /api/nhs/pds/actions, /api/nhs/pds/metadata, /api/nhs/pds/patient, /api/nhs/pds/patient/{id}, /api/nhs/radiology, /api/nhs/radiology/actions, /api/nhs/scr, /api/nhs/scr/actions, /api/openapi.json, /api/operator/cis2, /api/plan-lab, /api/session, /api/sites/gp/documents, /api/sites/gp/messaging-workspace, /api/sites/hospital/attendances, /api/sites/hospital/documents, /api/sites/patient/messaging-workspace, /api/sites/pharmacy/pharmacy-workspace, /api/sites/wearables/devices, /api/sites/wearables/readings, /api/sites/{site}/actions, /api/sites/{site}/appointments, /api/sites/{site}/patients, /api/sites/{site}/view, /api/team, /api/telephony/live, /cis2/.well-known/openid-configuration, /cis2/authorize, /cis2/jwks, /cis2/session, /cis2/token, /cis2/userinfo, /healthz, /openapi.json, 101, 200, 201, 303, 400, 401, 403, 404, 405, 409, 410, 413, 426, 429, 500, 501, action, active, actor, acuity, additionalproperties, address, affectedpatientcount, agents, allergystatus, allof, apikey, arrivalat, baseline, battery, birthdate, bloodtestorder, browsersession, bundle, changes, cis2accesstoken, cis2configuration, cis2settings, clientrequestid, clients, clinicaldetails, clinician, clock, collection, components, conditions, consultationstatus, content, costpence, counters, created, createdat, data, delete, deprecated, description, detail, dischargesections, disposition, documentcommand, documentsnomedcodes, documenttags, dose, drug, dueat, duration, durationminutes, durationms, endsat, entry, error, event, events, expectedversion, extension, faults, fhirorganization, fhirpatient, frequency, generalpractitioner, get, goals, gp, hospital, hospitalcommand, hospitalnote, hospitalnotecommand, id, identifier, identities, in, indication, info, issue, items, key, kind, lastrequestat, lastsyncedat, legacy, limit, link, localids, location, logging, maxrequestsperworld, medicationorder, message, messagingcommand, meta, method, metric, mode, name, needs, nhs_sim, now, observedat, offset, oneof, onsetdate, openapi, operationid, operationoutcome, operatoractivity, operatorchange, operatorkey, operatorlogging, operatorrequest, operatorteam, org, organisation, owner, panel, panelid, parameters, path, paths, patient, patientcount, patientid, patientids, patients, paused, pharmacycommand, pharmacypathway, population, post, presentingcomplaint, pricepence, priority, problemcode, problemstatus, productid, properties, provenance, put, quality, quantity, quoteid, quoteversion, reaction, recordchange, reference, referralsource, reorderlevel, requestbody, requestcount, requests, required, requiredunits, resource, resourcecount, resourceid, resourcelimit, resourceoffset, resources, resourcetotal, resourcetype, responses, retentiondays, role, route, scenario, schemas, scheme, scopes, security, securityschemes, servers, sessionid, sessionversion, since, slotcommand, slotminutes, source, sourceallergykey, sourceproblemkey, specimen, speed, staffidentity, staffing, stage, startsat, status, storage, sub, subject, summary, synthetic, tag, tags, target, team, teamkey, teamname, telecom, telephonyclientmessage, telephonyservermessage, text, time, title, tokenlifetimeseconds, total, type, unit, url, value, version, versionid, view, visibleto, wearabledevice, wearabledevicedata, wearabledevicespage, wearablereading, wearablereadingdata, wearablereadingspage, workspace, world, x-site-registry
```