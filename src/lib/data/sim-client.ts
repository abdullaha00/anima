/**
 * Server-only fetch wrapper for the simulator.
 *
 * This module must only be imported from server code: route handlers, server
 * components, server actions and scripts. The API key is read from
 * process.env here and nowhere else. The guard below throws if the module is
 * ever bundled into a browser.
 */

if (typeof window !== 'undefined') {
  throw new Error('sim-client is server-only');
}

const DEFAULT_BASE_URL = 'https://sim.animahealth.com';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_APP_BASE_URL = 'https://cairnhealth.online';

export interface SimResponse<T> {
  /** HTTP status. 0 means the request never completed (timeout or network error). */
  status: number;
  /** Parsed body, or null when the status was not 200 or the body was not JSON. */
  json: T | null;
}

export interface SimGetOptions {
  timeoutMs?: number;
}

export interface SimPostOptions {
  timeoutMs?: number;
}

/** The simulator base URL, without a trailing slash. */
export function simBaseUrl(): string {
  const raw = process.env.SIM_BASE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, '');
}

/** The team key. Throws when missing, because nothing works without it. */
function simApiKey(): string {
  const key = process.env.SIM_API_KEY?.trim();
  if (!key) {
    throw new Error('SIM_API_KEY is not set. Add it to .env.local.');
  }
  return key;
}

/**
 * The link back into this app for a given patient, for embedding in messages
 * sent out to the simulator so a clinician can jump straight from the
 * document/task into the patient's record here.
 */
export function appPatientUrl(patientId: string): string {
  const raw = process.env.APP_BASE_URL?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_APP_BASE_URL;
  return `${base.replace(/\/+$/, '')}/patient/${patientId}`;
}

/** Build the full URL for a path and optional query parameters. */
function buildUrl(path: string, params?: Record<string, string | number>): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, `${simBaseUrl()}/`);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }
  }
  return url.toString();
}

/**
 * GET a JSON resource from the simulator.
 *
 * Never throws on HTTP errors, timeouts or malformed bodies; those come back
 * as a non-200 status with a null body. The only thrown error is a missing key.
 */
export async function simGet<T>(
  path: string,
  params?: Record<string, string | number>,
  opts?: SimGetOptions,
): Promise<SimResponse<T>> {
  const key = simApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path, params), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    if (response.status !== 200) {
      return { status: response.status, json: null };
    }

    try {
      const json = (await response.json()) as T;
      return { status: 200, json };
    } catch {
      return { status: 200, json: null };
    }
  } catch {
    // Aborted (timeout) or a network failure. Callers treat status 0 as retryable.
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST a scoped action to a site's `/actions` endpoint (e.g. `process_document`
 * against `/api/sites/gp/actions`). This is how writes go back to the
 * simulator; the resource GET endpoints (`/api/sites/gp/documents`, etc.) are
 * read-only.
 *
 * Never throws on HTTP errors, timeouts or malformed bodies; those come back
 * as a non-200 status with a null body. The only thrown error is a missing key.
 */
export async function simPost<T>(
  path: string,
  body: Record<string, unknown>,
  opts?: SimPostOptions,
): Promise<SimResponse<T>> {
  const key = simApiKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (response.status !== 200 && response.status !== 201) {
      return { status: response.status, json: null };
    }

    try {
      const json = (await response.json()) as T;
      return { status: response.status, json };
    } catch {
      return { status: response.status, json: null };
    }
  } catch {
    // Aborted (timeout) or a network failure. Callers treat status 0 as retryable.
    return { status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/** The seven free-text sections of a discharge summary document. */
export interface DischargeSections {
  reason: string;
  course: string;
  diagnoses: string;
  medicationChanges: string;
  results: string;
  followUp: string;
  gpActions: string;
}

/**
 * Create a discharge summary document at the hospital site (`save_discharge_summary`
 * action). It starts as a hospital-only draft (`visibleTo: ["hospital"]`) — call
 * `simProcessDocument` with `documentCommand: 'send'` to hand it to the GP.
 */
export async function simSaveDischargeSummary(
  args: {
    patientId: string;
    title: string;
    dischargeSections: DischargeSections;
  },
  opts?: SimPostOptions,
): Promise<SimResponse<unknown>> {
  return simPost(
    '/api/sites/hospital/actions',
    {
      type: 'save_discharge_summary',
      patientId: args.patientId,
      title: args.title,
      dischargeSections: args.dischargeSections,
    },
    opts,
  );
}

/**
 * Move a document through its workflow at a site (`process_document` action):
 * `send` (hospital → gp), `assign`, `review`, `file`, or `annotate`.
 * `expectedVersion` must match the document's current `version` from the
 * matching GET, or the simulator rejects the write (optimistic concurrency).
 */
export async function simProcessDocument(
  site: 'gp' | 'hospital',
  args: {
    patientId: string;
    resourceId: string;
    expectedVersion: number;
    documentCommand: 'send' | 'assign' | 'review' | 'file' | 'annotate';
    text: string;
  },
  opts?: SimPostOptions,
): Promise<SimResponse<unknown>> {
  return simPost(
    `/api/sites/${site}/actions`,
    {
      type: 'process_document',
      patientId: args.patientId,
      resourceId: args.resourceId,
      expectedVersion: args.expectedVersion,
      documentCommand: args.documentCommand,
      text: args.text,
    },
    opts,
  );
}

/**
 * Save a discharge-summary document with only `gpActions` populated (the other
 * six required sections get a placeholder) and immediately send it to the GP.
 * This is the only document-creation action the simulator offers, and it must
 * be authored by the hospital site regardless of who the content is really
 * from — `save_discharge_summary` rejects the call from any other site.
 */
async function sendGpNote(
  args: { patientId: string; title: string; gpActions: string; sendNote: string },
  opts?: SimPostOptions,
): Promise<SimResponse<unknown>> {
  const saved = await simSaveDischargeSummary(
    {
      patientId: args.patientId,
      title: args.title,
      dischargeSections: {
        reason: 'N/A',
        course: 'N/A',
        diagnoses: 'N/A',
        medicationChanges: 'N/A',
        results: 'N/A',
        followUp: 'N/A',
        gpActions: args.gpActions,
      },
    },
    opts,
  );

  if (saved.status !== 200 && saved.status !== 201) return saved;

  const resourceId = (saved.json as { id?: string } | null)?.id;
  const version = (saved.json as { version?: number } | null)?.version;
  if (!resourceId || version === undefined) return saved;

  return simProcessDocument(
    'hospital',
    {
      patientId: args.patientId,
      resourceId,
      expectedVersion: version,
      documentCommand: 'send',
      text: args.sendNote,
    },
    opts,
  );
}

/**
 * Send a minimal document to the GP flagging that a patient needs a care plan
 * discussed and written. The message includes a link back into this app's
 * patient record, so the clinician can jump straight from the document to the
 * case.
 *
 * Marked urgent in the title and text: the simulator has no settable priority
 * field for documents (`save_discharge_summary` silently ignores a `priority`
 * input, and `process_document`'s document-tagging path requires SNOMED codes
 * from a catalogue we don't have access to), so "urgent" can only ever be a
 * content convention here, not a structured flag.
 */
export async function simFlagCarePlan(
  patientId: string,
  opts?: SimPostOptions,
): Promise<SimResponse<unknown>> {
  const link = appPatientUrl(patientId);
  return sendGpNote(
    {
      patientId,
      title: 'URGENT: Care plan needed',
      gpActions: `URGENT — Patient needs a care plan discussed and written. Open in Cairn: ${link}`,
      sendNote: `URGENT — Flagging care plan discussion needed. Open in Cairn: ${link}`,
    },
    opts,
  );
}

/**
 * Send the GP their copy of a signed ReSPECT record: the full set of present
 * fields the GP audience is allowed to see, one per line, plus a link back
 * into this app's patient record.
 */
export async function simShareRespectRecord(
  patientId: string,
  args: {
    patientLabel: string;
    fields: { label: string; value: string }[];
    signedBy?: string;
    signedAt?: string;
  },
  opts?: SimPostOptions,
): Promise<SimResponse<unknown>> {
  const link = appPatientUrl(patientId);
  const signed = args.signedBy ? ` Signed by ${args.signedBy}${args.signedAt ? ` on ${args.signedAt}` : ''}.` : '';
  const body = args.fields.map((f) => `${f.label}: ${f.value}`).join('\n');
  const gpActions = [
    `ReSPECT record shared for ${args.patientLabel}.${signed}`,
    '',
    body,
    '',
    `Open in Cairn: ${link}`,
  ].join('\n');

  return sendGpNote(
    {
      patientId,
      title: `ReSPECT record — ${args.patientLabel}`,
      gpActions,
      sendNote: `Sharing the signed ReSPECT record. Open in Cairn: ${link}`,
    },
    opts,
  );
}
