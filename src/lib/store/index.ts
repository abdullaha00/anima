/**
 * The case store.
 *
 * A small server-side JSON store under data/state/cases.json. No database. It survives a
 * refresh and a restart and needs no infrastructure. The file is read on every call (it is
 * small), writes go to a temporary file and are renamed into place, and writes are
 * serialised through a module-level promise chain so two concurrent actions cannot clobber
 * each other's read-modify-write.
 *
 * This file is the intended seam: swapping it for a real backend (a database, an FHIR
 * store, whatever the deployment needs) should touch this file and nothing else. Every
 * caller goes through the exported functions and never through the file system.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CaseState } from "@/lib/domain/types";
import { newRecord } from "@/lib/record/record";

interface StoreFile {
  version: 1;
  cases: Record<string, CaseState>;
}

/**
 * Resolved on every call rather than at import time, so a process that changes directory
 * (the tests do) or sets CAIRN_STATE_DIR writes where it expects to.
 */
function stateDir(): string {
  return process.env.CAIRN_STATE_DIR ?? path.join(process.cwd(), "data", "state");
}

function stateFile(): string {
  return path.join(stateDir(), "cases.json");
}

export function nowIso(): string {
  return new Date().toISOString();
}

function emptyFile(): StoreFile {
  return { version: 1, cases: {} };
}

function isStoreFile(value: unknown): value is StoreFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as { cases?: unknown };
  return typeof v.cases === "object" && v.cases !== null && !Array.isArray(v.cases);
}

/** Read the whole file. A missing or corrupt file starts the store empty. */
async function readFile(): Promise<StoreFile> {
  let raw: string;
  try {
    raw = await fs.readFile(stateFile(), "utf8");
  } catch {
    return emptyFile();
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoreFile(parsed) ? parsed : emptyFile();
  } catch {
    return emptyFile();
  }
}

/** Write atomically: temp file in the same directory, then rename over the target. */
async function writeFile(data: StoreFile): Promise<void> {
  const dir = stateDir();
  const target = stateFile();
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `cases.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  try {
    await fs.rename(tmp, target);
  } catch (err) {
    // Windows can refuse a rename while another reader holds the target open; one retry
    // is enough in practice because readers hold the file for microseconds.
    await new Promise((r) => setTimeout(r, 25));
    try {
      await fs.rename(tmp, target);
    } catch {
      await fs.rm(tmp, { force: true });
      throw err;
    }
  }
}

/** All writes queue behind this chain, so a read-modify-write is never interleaved. */
let writeLock: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn, fn);
  // Keep the chain alive whether or not this step fails.
  writeLock = run.catch(() => undefined);
  return run;
}

function freshCase(patientId: string): CaseState {
  return {
    patientId,
    state: "flagged",
    participants: [],
    removedParticipants: [],
    threads: [],
    record: newRecord(patientId),
    audit: [],
    updatedAt: nowIso(),
  };
}

/** The case for a patient, creating and persisting a fresh flagged case if none exists. */
export async function getCase(patientId: string): Promise<CaseState> {
  return withLock(async () => {
    const data = await readFile();
    const existing = data.cases[patientId];
    if (existing) return existing;
    const created = freshCase(patientId);
    data.cases[patientId] = created;
    await writeFile(data);
    return created;
  });
}

/** The case for a patient if one has been started. Never creates. */
export async function findCase(patientId: string): Promise<CaseState | undefined> {
  const data = await readFile();
  return data.cases[patientId];
}

export async function listCases(): Promise<CaseState[]> {
  const data = await readFile();
  return Object.values(data.cases);
}

export async function casesById(): Promise<Map<string, CaseState>> {
  const cases = await listCases();
  return new Map(cases.map((c) => [c.patientId, c]));
}

/**
 * Read, apply the mutation, stamp updatedAt, write. The whole step runs under the write
 * lock, so concurrent actions on any patient land one after another and none is lost.
 */
export async function updateCase(patientId: string, mutate: (c: CaseState) => CaseState): Promise<CaseState> {
  return withLock(async () => {
    const data = await readFile();
    const current = data.cases[patientId] ?? freshCase(patientId);
    const next = { ...mutate(current), updatedAt: nowIso() };
    data.cases[patientId] = next;
    await writeFile(data);
    return next;
  });
}

/** Development helper behind the "reset demo" affordance. Removes the case entirely. */
export async function resetCase(patientId: string): Promise<void> {
  await withLock(async () => {
    const data = await readFile();
    if (!(patientId in data.cases)) return;
    delete data.cases[patientId];
    await writeFile(data);
  });
}

export async function resetAll(): Promise<void> {
  await withLock(async () => {
    await writeFile(emptyFile());
  });
}
