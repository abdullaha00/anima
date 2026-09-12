import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SIMULATOR_ORIGIN,
  assertPatientId,
  requireSimulatorKey,
} from "./config";
import { ensureDirectory, errorMessage, writeJsonAtomic } from "./json-files";
import type {
  CollectionRequest,
  CollectionResult,
  RecordManifest,
} from "./types";

const SITE_NAMES = [
  "gp",
  "hospital",
  "community",
  "pharmacy",
  "diagnostics",
  "referrals",
  "wearables",
  "patient",
] as const;

const PATIENTLESS_CONTEXT_KINDS = new Set(["capacity"]);

interface ApiResponse {
  data: unknown;
  attempts: number;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function buildUrl(
  endpoint: string,
  query: Record<string, string | number> = {},
): URL {
  const url = new URL(endpoint, SIMULATOR_ORIGIN);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function apiGet(
  key: string,
  endpoint: string,
  query?: Record<string, string | number>,
): Promise<ApiResponse> {
  const url = buildUrl(endpoint, query);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${key}`,
        },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const body = (await response.text()).slice(0, 500);
        throw new Error(
          `${response.status} ${response.statusText}${body ? `: ${body}` : ""}`,
        );
      }
      return { data: (await response.json()) as unknown, attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(`GET ${url.pathname} failed after 5 attempts: ${errorMessage(lastError)}`);
}

function explicitPatientIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (key === "patientId" && typeof child === "string") {
        ids.add(child);
      } else if (key === "reference" && typeof child === "string") {
        const match = child.match(/(?:^|\/)Patient\/(SIM-\d{6})$/i);
        if (match) ids.add(match[1].toUpperCase());
      } else {
        visit(child);
      }
    }
  }
  visit(value);
  return ids;
}

function hasOnlyTargetPatient(value: unknown, patientId: string): boolean {
  const ids = explicitPatientIds(value);
  return ids.size === 1 && ids.has(patientId);
}

function workspaceResourceMatches(value: unknown, patientId: string): boolean {
  const resource = asObject(value);
  return resource?.patientId === patientId;
}

export function parseWorkspacePayload(value: unknown, patientId: string): unknown {
  const source = asObject(value);
  if (!source || !Array.isArray(source.resources) || !Array.isArray(source.patients)) {
    throw new Error("Unexpected workspace response shape");
  }
  return {
    resources: source.resources.filter((resource) =>
      workspaceResourceMatches(resource, patientId),
    ),
    patients: source.patients.filter(
      (patient) => asObject(patient)?.id === patientId,
    ),
    ...(typeof source.now === "number" ? { now: source.now } : {}),
  };
}

export function parseFhirBundle(value: unknown, patientId: string): unknown {
  const source = asObject(value);
  if (source?.resourceType !== "Bundle" || !Array.isArray(source.entry)) {
    throw new Error("Unexpected FHIR Bundle response shape");
  }
  const entry = source.entry.filter((candidate) => {
    const wrapped = asObject(candidate);
    const resource = asObject(wrapped?.resource);
    if (resource?.resourceType === "Patient") {
      return resource.id === patientId;
    }
    return hasOnlyTargetPatient(resource, patientId);
  });
  return {
    resourceType: "Bundle",
    type: source.type,
    total: entry.length,
    originalTotal: source.total,
    entry,
  };
}

function parseFhirPatient(value: unknown, patientId: string): unknown {
  const patient = asObject(value);
  if (patient?.resourceType !== "Patient" || patient.id !== patientId) {
    throw new Error("PDS returned a different or malformed patient");
  }
  return patient;
}

function parsePatientItems(value: unknown, patientId: string): unknown {
  const source = asObject(value);
  if (!source || !Array.isArray(source.items)) {
    throw new Error("Unexpected patient items response shape");
  }
  const items = source.items.filter((item) =>
    workspaceResourceMatches(item, patientId),
  );
  return {
    items,
    total: items.length,
    originalTotal: source.total,
    offset: 0,
    limit: items.length,
    ...(typeof source.now === "number" ? { now: source.now } : {}),
  };
}

function parseDirectoryPayload(value: unknown, patientId: string): unknown {
  const source = asObject(value);
  if (!source || !Array.isArray(source.items)) {
    throw new Error("Unexpected patient directory response shape");
  }
  const items = source.items.filter(
    (item) => asObject(item)?.id === patientId,
  );
  return { total: items.length, originalTotal: source.total, items };
}

function parseClock(value: unknown): unknown {
  const source = asObject(value);
  if (!source || typeof source.now !== "number") {
    throw new Error("Unexpected simulation clock response shape");
  }
  return {
    now: source.now,
    ...(typeof source.paused === "boolean" ? { paused: source.paused } : {}),
    ...(typeof source.speed === "number" ? { speed: source.speed } : {}),
  };
}

function parseCollectedPayload(
  parser: CollectionRequest["parser"],
  value: unknown,
  patientId: string,
): unknown {
  switch (parser) {
    case "clock":
      return parseClock(value);
    case "directory":
      return parseDirectoryPayload(value, patientId);
    case "workspace":
      return parseWorkspacePayload(value, patientId);
    case "fhir-bundle":
      return parseFhirBundle(value, patientId);
    case "fhir-patient":
      return parseFhirPatient(value, patientId);
    case "patient-items":
      return parsePatientItems(value, patientId);
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(values[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

async function collectRequest(
  key: string,
  recordDirectory: string,
  patientId: string,
  request: CollectionRequest,
): Promise<CollectionResult> {
  const collectedAt = new Date().toISOString();
  const destination = path.join(recordDirectory, request.relativePath);

  try {
    let response = await apiGet(key, request.endpoint, request.query);
    if (request.paginateItems) {
      const firstPage = asObject(response.data);
      if (!firstPage || !Array.isArray(firstPage.items)) {
        throw new Error("Unexpected paginated response: items array missing");
      }
      const items = [...firstPage.items];
      const total = typeof firstPage.total === "number" ? firstPage.total : items.length;
      let offset = items.length;
      let attempts = response.attempts;
      while (offset < total) {
        const pageResponse = await apiGet(key, request.endpoint, {
          ...request.query,
          offset,
          limit: 500,
        });
        attempts += pageResponse.attempts;
        const page = asObject(pageResponse.data);
        if (!page || !Array.isArray(page.items)) {
          throw new Error("Unexpected paginated response: items array missing");
        }
        items.push(...page.items);
        if (page.items.length === 0) break;
        offset += page.items.length;
      }
      response = {
        data: { ...firstPage, items, offset: 0, limit: items.length },
        attempts,
      };
    }
    const data = parseCollectedPayload(
      request.parser,
      response.data,
      patientId,
    );
    await writeJsonAtomic(destination, data);
    return {
      name: request.name,
      relativePath: request.relativePath,
      endpoint: request.endpoint,
      status: "ok",
      attempts: response.attempts,
      collectedAt,
    };
  } catch (error) {
    const message = errorMessage(error);
    await writeJsonAtomic(destination, {
      collectionStatus: "failed",
      endpoint: request.endpoint,
      error: message,
      collectedAt,
    });
    return {
      name: request.name,
      relativePath: request.relativePath,
      endpoint: request.endpoint,
      status: "failed",
      attempts: 5,
      collectedAt,
      error: message,
    };
  }
}

async function collectSiteView(
  key: string,
  recordDirectory: string,
  patientId: string,
  site: (typeof SITE_NAMES)[number],
): Promise<CollectionResult> {
  const endpoint = `/api/sites/${site}/view`;
  const collectedAt = new Date().toISOString();
  const siteDirectory = path.join(recordDirectory, "sites", site);
  await ensureDirectory(siteDirectory);

  try {
    const patientResources: unknown[] = [];
    const serviceContext: unknown[] = [];
    const pages: Array<Record<string, unknown>> = [];
    let droppedOtherPatientResources = 0;
    let droppedUnscopedResources = 0;
    let offset = 0;
    let attempts = 0;

    while (true) {
      const response = await apiGet(key, endpoint, {
        patient: patientId,
        offset,
        limit: 500,
      });
      attempts += response.attempts;
      const page = asObject(response.data);
      if (!page || !Array.isArray(page.resources)) {
        throw new Error("Unexpected site view response: resources array missing");
      }

      for (const resource of page.resources) {
        const object = asObject(resource);
        if (workspaceResourceMatches(resource, patientId)) {
          patientResources.push(resource);
        } else if (typeof object?.patientId === "string") {
          droppedOtherPatientResources += 1;
        } else if (
          typeof object?.kind === "string" &&
          PATIENTLESS_CONTEXT_KINDS.has(object.kind)
        ) {
          serviceContext.push(resource);
        } else {
          droppedUnscopedResources += 1;
        }
      }

      const total =
        typeof page.resourceTotal === "number"
          ? page.resourceTotal
          : page.resources.length;
      pages.push({
        resourceOffset: page.resourceOffset ?? offset,
        resourceLimit: page.resourceLimit ?? 500,
        returned: page.resources.length,
        resourceTotal: total,
      });
      offset += page.resources.length;
      if (page.resources.length === 0 || offset >= total) break;
    }

    await Promise.all([
      writeJsonAtomic(
        path.join(siteDirectory, "patient-resources.json"),
        patientResources,
      ),
      writeJsonAtomic(
        path.join(siteDirectory, "service-context.json"),
        serviceContext,
      ),
      writeJsonAtomic(path.join(siteDirectory, "view-metadata.json"), {
        site,
        patientId,
        collectedAt,
        pages,
        patientResourceCount: patientResources.length,
        serviceContextCount: serviceContext.length,
        droppedOtherPatientResources,
        droppedUnscopedResources,
      }),
    ]);

    return {
      name: `site-${site}`,
      relativePath: `sites/${site}/patient-resources.json`,
      endpoint,
      status: "ok",
      attempts,
      collectedAt,
    };
  } catch (error) {
    const message = errorMessage(error);
    await Promise.all([
      writeJsonAtomic(path.join(siteDirectory, "patient-resources.json"), {
        collectionStatus: "failed",
        error: message,
      }),
      writeJsonAtomic(path.join(siteDirectory, "service-context.json"), []),
      writeJsonAtomic(path.join(siteDirectory, "view-metadata.json"), {
        site,
        patientId,
        collectedAt,
        collectionStatus: "failed",
        error: message,
      }),
    ]);
    return {
      name: `site-${site}`,
      relativePath: `sites/${site}/patient-resources.json`,
      endpoint,
      status: "failed",
      attempts: 5,
      collectedAt,
      error: message,
    };
  }
}

function collectResourceObjects(
  value: unknown,
  sourcePath: string,
  byId: Map<string, unknown>,
  provenance: Map<string, Set<string>>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectResourceObjects(item, sourcePath, byId, provenance);
    }
    return;
  }
  if (!value || typeof value !== "object") return;

  const object = value as Record<string, unknown>;
  if (
    typeof object.id === "string" &&
    (typeof object.kind === "string" || typeof object.resourceType === "string")
  ) {
    if (!byId.has(object.id)) byId.set(object.id, object);
    const paths = provenance.get(object.id) ?? new Set<string>();
    paths.add(sourcePath);
    provenance.set(object.id, paths);
    return;
  }

  for (const child of Object.values(object)) {
    collectResourceObjects(child, sourcePath, byId, provenance);
  }
}

async function evaluateSafetyGate(
  recordDirectory: string,
  patientId: string,
  sources: CollectionResult[],
): Promise<RecordManifest["safetyGate"]> {
  const reasons: string[] = [];
  const readJson = async (relativePath: string): Promise<unknown> => {
    try {
      return JSON.parse(
        await readFile(path.join(recordDirectory, relativePath), "utf8"),
      ) as unknown;
    } catch {
      return undefined;
    }
  };

  const directory = asObject(await readJson("patient/directory.json"));
  const directoryPatient = Array.isArray(directory?.items)
    ? directory.items.find((item) => asObject(item)?.id === patientId)
    : undefined;
  const pds = asObject(await readJson("patient/pds.json"));
  const pdsHasPatient = Array.isArray(pds?.entry)
    ? pds.entry.some((entry) => {
        const resource = asObject(asObject(entry)?.resource);
        return resource?.resourceType === "Patient" && resource.id === patientId;
      })
    : false;
  const directPds = asObject(await readJson("patient/pds-fhir.json"));
  if (!directoryPatient && !pdsHasPatient && directPds?.id !== patientId) {
    reasons.push("No exact patient identity was returned by directory or PDS sources");
  }

  const indexed = await readJson("index/deduplicated-resources.json");
  const indexedClinicalEvidence = Array.isArray(indexed)
    ? indexed.some((item) => {
        const resource = asObject(item);
        return Boolean(resource && resource.resourceType !== "Patient");
      })
    : false;
  const directoryObject = asObject(directoryPatient);
  const structuredClinicalEvidence = ["conditions", "needs", "goals"].some(
    (key) => Array.isArray(directoryObject?.[key]) && directoryObject[key].length > 0,
  );
  if (!indexedClinicalEvidence && !structuredClinicalEvidence) {
    reasons.push("No patient-specific clinical evidence was collected");
  }

  const coreSourceNames = new Set([
    "site-gp",
    "site-hospital",
    "site-community",
    "site-diagnostics",
    "hospital-documents",
    "gp-documents",
    "nhs-radiology",
    "nhs-pathology",
  ]);
  if (
    !sources.some(
      (source) => coreSourceNames.has(source.name) && source.status === "ok",
    )
  ) {
    reasons.push("Every core longitudinal clinical source failed collection");
  }

  return { forceInsufficientEvidence: reasons.length > 0, reasons };
}

async function buildResourceIndex(
  recordDirectory: string,
  sourceFiles: string[],
): Promise<{ unique: number; duplicates: number }> {
  const byId = new Map<string, unknown>();
  const provenance = new Map<string, Set<string>>();

  for (const sourceFile of sourceFiles) {
    try {
      const absolutePath = path.join(recordDirectory, sourceFile);
      const text = await readFile(absolutePath, "utf8");
      collectResourceObjects(
        JSON.parse(text) as unknown,
        sourceFile,
        byId,
        provenance,
      );
    } catch {
      // Failed sources are represented in the manifest and their placeholder files.
    }
  }

  const resources = [...byId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, resource]) => resource);
  const provenanceObject = Object.fromEntries(
    [...provenance.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, paths]) => [id, [...paths].sort()]),
  );
  await Promise.all([
    writeJsonAtomic(
      path.join(recordDirectory, "index", "deduplicated-resources.json"),
      resources,
    ),
    writeJsonAtomic(
      path.join(recordDirectory, "index", "provenance.json"),
      provenanceObject,
    ),
  ]);

  return {
    unique: resources.length,
    duplicates: [...provenance.values()].filter((paths) => paths.size > 1).length,
  };
}

export async function collectPatientRecord(
  inputPatientId: string,
  runDirectory: string,
): Promise<RecordManifest> {
  const patientId = assertPatientId(inputPatientId);
  const key = requireSimulatorKey();
  const recordDirectory = path.join(runDirectory, "record");
  await ensureDirectory(recordDirectory);

  const requests: CollectionRequest[] = [
    {
      name: "simulation-clock",
      relativePath: "clock/simulation.json",
      endpoint: "/api/clock",
      parser: "clock",
    },
    {
      name: "patient-directory",
      relativePath: "patient/directory.json",
      endpoint: "/api/sites/gp/patients",
      query: { q: patientId },
      parser: "directory",
    },
    {
      name: "pds-adapter",
      relativePath: "patient/pds.json",
      endpoint: "/api/nhs/pds",
      query: { patient: patientId },
      parser: "fhir-bundle",
    },
    {
      name: "pds-fhir-patient",
      relativePath: "patient/pds-fhir.json",
      endpoint: `/api/nhs/pds/Patient/${encodeURIComponent(patientId)}`,
      parser: "fhir-patient",
    },
    ...[
      "eps",
      "eps-tracker",
      "ers",
      "gp-connect",
      "mesh",
      "scr",
      "pathology",
      "radiology",
      "appointments",
    ].map((adapter): CollectionRequest => ({
      name: `nhs-${adapter}`,
      relativePath: `nhs/${adapter}.json`,
      endpoint: `/api/nhs/${adapter}`,
      query: { patient: patientId },
      parser: "fhir-bundle",
    })),
    {
      name: "hospital-attendances",
      relativePath: "direct/hospital-attendances.json",
      endpoint: "/api/sites/hospital/attendances",
      parser: "workspace",
    },
    {
      name: "hospital-documents",
      relativePath: "direct/hospital-documents.json",
      endpoint: "/api/sites/hospital/documents",
      parser: "workspace",
    },
    {
      name: "gp-documents",
      relativePath: "direct/gp-documents.json",
      endpoint: "/api/sites/gp/documents",
      parser: "workspace",
    },
    {
      name: "patient-messaging",
      relativePath: "direct/patient-messaging.json",
      endpoint: "/api/sites/patient/messaging-workspace",
      query: { patientId },
      parser: "workspace",
    },
    {
      name: "wearable-devices",
      relativePath: "direct/wearable-devices.json",
      endpoint: "/api/sites/wearables/devices",
      query: { patient: patientId, offset: 0, limit: 500 },
      parser: "patient-items",
      paginateItems: true,
    },
    {
      name: "wearable-readings",
      relativePath: "direct/wearable-readings.json",
      endpoint: "/api/sites/wearables/readings",
      query: { patient: patientId, offset: 0, limit: 500 },
      parser: "patient-items",
      paginateItems: true,
    },
  ];

  const requestResults = await mapWithConcurrency(
    requests,
    4,
    (request) => collectRequest(key, recordDirectory, patientId, request),
  );
  const siteResults = await mapWithConcurrency(
    SITE_NAMES,
    2,
    (site) => collectSiteView(key, recordDirectory, patientId, site),
  );
  const sources = [...requestResults, ...siteResults];
  const index = await buildResourceIndex(
    recordDirectory,
    sources.filter((source) => source.status === "ok").map((source) => source.relativePath),
  );
  const failedSources = sources
    .filter((source) => source.status === "failed")
    .map((source) => source.name);

  const safetyGate = await evaluateSafetyGate(
    recordDirectory,
    patientId,
    sources,
  );
  const manifest: RecordManifest = {
    schemaVersion: "1.0",
    patientId,
    collectedAt: new Date().toISOString(),
    simulatorOrigin: SIMULATOR_ORIGIN,
    sources,
    coverage: {
      successful: sources.length - failedSources.length,
      failed: failedSources.length,
      failedSources,
    },
    deduplication: {
      uniqueResourceCount: index.unique,
      resourcesWithDuplicateVisibility: index.duplicates,
    },
    safetyGate,
  };
  await writeJsonAtomic(path.join(recordDirectory, "manifest.json"), manifest);
  return manifest;
}
