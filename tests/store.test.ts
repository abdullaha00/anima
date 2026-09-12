/**
 * The case store: creates, persists, serialises concurrent writes, resets.
 * Run with: npx tsx --test tests/store.test.ts
 *
 * Writes into its own temporary directory so it never touches data/state in the project.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getCase, findCase, listCases, casesById, updateCase, resetCase, resetAll, nowIso } from "../src/lib/store/index";

let tmpDir: string;
let originalCwd: string;

before(() => {
  originalCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-store-"));
  process.chdir(tmpDir);
  delete process.env.CAIRN_STATE_DIR;
});

after(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const stateFile = () => path.join(tmpDir, "data", "state", "cases.json");

test("getCase creates and persists a flagged case", async () => {
  await resetAll();
  const c = await getCase("p-1");
  assert.equal(c.patientId, "p-1");
  assert.equal(c.state, "flagged");
  assert.deepEqual(c.participants, []);
  assert.deepEqual(c.removedParticipants, []);
  assert.deepEqual(c.threads, []);
  assert.deepEqual(c.audit, []);
  assert.equal(c.record.patientId, "p-1");
  assert.equal(c.record.status, "draft");
  assert.ok(!Number.isNaN(Date.parse(c.updatedAt)));

  assert.ok(fs.existsSync(stateFile()), "cases.json written under data/state");
  const onDisk = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as { cases: Record<string, unknown> };
  assert.ok("p-1" in onDisk.cases);

  // A second call returns the same case, not a fresh one.
  const again = await getCase("p-1");
  assert.equal(again.updatedAt, c.updatedAt);
});

test("findCase never creates", async () => {
  await resetAll();
  assert.equal(await findCase("p-none"), undefined);
  assert.deepEqual(await listCases(), []);
});

test("updateCase persists across a fresh read", async () => {
  await resetAll();
  await getCase("p-2");
  const before = nowIso();
  const updated = await updateCase("p-2", (c) => ({
    ...c,
    state: "team assembled",
    audit: [...c.audit, { at: nowIso(), action: "state", actor: "test", detail: "flagged -> team assembled" }],
  }));
  assert.equal(updated.state, "team assembled");
  assert.ok(updated.updatedAt >= before);

  // Fresh read from disk, not from any cache.
  const raw = JSON.parse(fs.readFileSync(stateFile(), "utf8")) as { cases: Record<string, { state: string }> };
  assert.equal(raw.cases["p-2"].state, "team assembled");

  const reread = await findCase("p-2");
  assert.equal(reread?.state, "team assembled");
  assert.equal(reread?.audit.length, 1);

  const byId = await casesById();
  assert.equal(byId.get("p-2")?.state, "team assembled");
});

test("updateCase on an unknown patient starts a fresh case", async () => {
  await resetAll();
  const c = await updateCase("p-new", (c) => ({ ...c, pausedReason: "not yet" }));
  assert.equal(c.state, "flagged");
  assert.equal(c.pausedReason, "not yet");
  assert.equal((await findCase("p-new"))?.pausedReason, "not yet");
});

test("concurrent updateCase calls all land", async () => {
  await resetAll();
  await getCase("p-3");
  const increment = () =>
    updateCase("p-3", (c) => ({
      ...c,
      audit: [...c.audit, { at: nowIso(), action: "test", actor: "test", detail: `event ${c.audit.length + 1}` }],
    }));
  await Promise.all([increment(), increment(), increment(), increment(), increment()]);
  const c = await findCase("p-3");
  assert.equal(c?.audit.length, 5);
  assert.deepEqual(
    c?.audit.map((e) => e.detail),
    ["event 1", "event 2", "event 3", "event 4", "event 5"],
  );

  // No temporary files left behind by the atomic writes.
  const leftovers = fs.readdirSync(path.dirname(stateFile())).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("resetCase removes only that case", async () => {
  await resetAll();
  await getCase("p-4");
  await getCase("p-5");
  await resetCase("p-4");
  assert.equal(await findCase("p-4"), undefined);
  assert.ok(await findCase("p-5"));
  await resetCase("p-does-not-exist"); // no throw
  assert.equal((await listCases()).length, 1);
});

test("a corrupt file starts the store empty", async () => {
  await resetAll();
  fs.writeFileSync(stateFile(), "{ this is not json", "utf8");
  assert.deepEqual(await listCases(), []);
  const c = await getCase("p-6");
  assert.equal(c.state, "flagged");
  assert.equal((await listCases()).length, 1);
});
