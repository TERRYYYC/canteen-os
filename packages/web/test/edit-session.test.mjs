import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { after, test } from "node:test";

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve("vite/package.json"));
const esbuild = await import(pathToFileURL(viteRequire.resolve("esbuild")).href);
const bundled = await esbuild.build({
  stdin: {
    contents: 'export * from "../src/view-models/edit-session.ts"; export { ApiError } from "../src/api/types.ts";',
    resolveDir: dirname(fileURLToPath(import.meta.url)),
  },
  bundle: true, write: false, format: "esm", platform: "browser", target: "es2022", logLevel: "silent",
});
const dir = await mkdtemp(join(tmpdir(), "canteenos-edit-session-"));
after(() => rm(dir, { recursive: true, force: true }));
const entry = join(dir, "session.mjs");
await writeFile(entry, bundled.outputFiles[0].text);
const { createEditSession, ApiError } = await import(pathToFileURL(entry).href);

const revisionA = "a".repeat(40);
const revisionB = "b".repeat(40);
const revisionC = "c".repeat(40);
const identity = { kind: "plan", id: "week-41" };
const original = { id: "week-41", schemaVersion: "3", meals: [] };
const edited = { ...original, meals: [{ date: "2026-10-05", mealType: "lunch", dishRef: "soup" }] };
const later = { ...edited, name: { zh: "后续编辑" } };
const source = (content = original, commit = revisionA, blobSha = "blob-a") => ({ content, commit, blobSha });
const write = (commit = revisionB, blobSha = "blob-b") => ({ commit, blobSha, unchanged: false, warnings: [] });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup({ mode = "real", save = async () => write(), read = async () => source() } = {}) {
  const writes = [], reads = [];
  let currentMode = mode;
  const session = createEditSession({
    mode: () => currentMode,
    save: (...args) => { writes.push(structuredClone(args)); return save(...args); },
    read: (...args) => { reads.push(structuredClone(args)); return read(...args); },
  });
  session.open(identity, original, source());
  return { session, writes, reads, setMode: value => { currentMode = value; } };
}

test("save snapshots generation and strong lock, retaining later edits until their own save", async () => {
  const response = deferred();
  const { session, writes } = setup({ save: () => response.promise });
  session.edit(edited);
  const pending = session.save();
  assert.equal(session.getState().phase, "saving");
  assert.deepEqual(writes[0][2], { ifMatch: "blob-a" });
  assert.equal(typeof writes[0][3].operationId, "string");
  session.edit(later);
  assert.equal(session.getState().phase, "saving");
  response.resolve(write());
  assert.equal((await pending).status, "saved");
  const state = session.getState();
  assert.equal(state.phase, "dirty");
  assert.equal(state.dirty, true);
  assert.deepEqual(state.draft, later);
  assert.deepEqual(state.source, source(edited, revisionB, "blob-b"));
  assert.deepEqual(writes[0][1], edited);
  assert.equal(state.lastSave.mode, "real");
  assert.equal((await session.save()).status, "saved");
  assert.deepEqual(writes[1][2], { ifMatch: "blob-b" });
  assert.equal(session.getState().phase, "saved-but-unpublished");
  assert.equal(session.getState().dirty, false);
  assert.notEqual(writes[0][3].operationId, writes[1][3].operationId);
});

test("new document uses If-None-Match star; clean documents never write", async () => {
  const { session, writes } = setup();
  assert.equal(session.getState().phase, "clean");
  assert.equal((await session.save()).status, "unchanged");
  session.open(identity, edited, null);
  assert.equal(session.getState().dirty, true);
  await session.save();
  assert.deepEqual(writes[0][2], { ifNoneMatch: "*" });
  assert.equal(session.getState().phase, "saved-but-unpublished");
});

test("pending save is not duplicated and external input/snapshot mutation cannot alter draft", async () => {
  const response = deferred();
  const { session, writes } = setup({ save: () => response.promise });
  const input = structuredClone(edited);
  session.edit(input);
  input.meals[0].dishRef = "external-mutation";
  session.getState().draft.meals[0].dishRef = "snapshot-mutation";
  const pending = session.save();
  assert.equal((await session.save()).status, "blocked");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0][1], edited);
  response.resolve(write());
  await pending;
  assert.deepEqual(session.getState().draft, edited);
});

for (const lifecycle of ["different-document", "same-document-language", "leave-page"]) {
  test(`late save response cannot mutate new context: ${lifecycle}`, async () => {
    const response = deferred();
    const { session } = setup({ save: () => response.promise });
    session.edit(edited);
    const pending = session.save();
    if (lifecycle === "leave-page") session.invalidate();
    else {
      const nextIdentity = lifecycle === "different-document" ? { kind: "plan", id: "week-42" } : identity;
      const next = { ...original, id: nextIdentity.id, name: { uk: "Новий контекст" } };
      session.open(nextIdentity, next, source(next, revisionC, "blob-c"));
    }
    const before = session.getState();
    response.resolve(write());
    assert.equal((await pending).status, "stale");
    assert.deepEqual(session.getState(), before);
  });
}

for (const code of ["conflict", "format_downgrade", "review_required"]) {
  test(`409 ${code} preserves editable draft and blocks blind retries`, async () => {
    const failure = new ApiError(409, code, "server message");
    if (code === "review_required") failure.reviewRequired = ["tomato", "salt"];
    const { session, writes, reads } = setup({ save: async () => { throw failure; } });
    session.edit(edited);
    assert.equal((await session.save()).status, "conflict");
    session.edit(later);
    const state = session.getState();
    assert.equal(state.phase, "conflict");
    assert.deepEqual(state.draft, later);
    assert.equal(state.error.code, code);
    assert.deepEqual(state.error.errors, failure.errors);
    assert.deepEqual(state.error.reviewRequired, failure.reviewRequired);
    assert.equal((await session.save()).status, "blocked");
    assert.equal(writes.length, 1);
    assert.equal(reads.length, 0);
  });
}

test("428 is an error with retained draft and condition, never an unconditional retry", async () => {
  const { session, writes } = setup({ save: async () => { throw new ApiError(428, "precondition_required", "required"); } });
  session.edit(edited);
  assert.equal((await session.save()).status, "error");
  assert.deepEqual(session.getState().draft, edited);
  assert.equal(writes.length, 1);
  await session.save();
  assert.equal(writes.length, 2);
  assert.deepEqual(writes.map(w => w[2]), [{ ifMatch: "blob-a" }, { ifMatch: "blob-a" }]);
});

for (const failure of [new ApiError(0, "network", ""), new ApiError(502, "upstream_error", ""), new ApiError(200, "bad_response", "")]) {
  test(`uncertain ${failure.status}/${failure.code} requires current then fixed-revision comparison`, async () => {
    const pinned = deferred();
    const { session, writes, reads } = setup({
      save: async () => { throw failure; },
      read: (_id, opts) => opts.revision ? pinned.promise : Promise.resolve(source(edited, revisionB, "blob-b")),
    });
    session.edit(edited);
    assert.equal((await session.save()).status, "outcome-unknown");
    assert.equal((await session.save()).status, "blocked");
    assert.equal(writes.length, 1);
    const pending = session.reconcileUnknown();
    await Promise.resolve();
    assert.deepEqual(reads.map(r => r[1]), [{ force: true }, { revision: revisionB, force: true }]);
    session.edit(later);
    assert.equal((await session.reconcileUnknown()).status, "blocked");
    pinned.resolve(source({ meals: edited.meals, schemaVersion: "3", id: "week-41" }, revisionB, "blob-b"));
    assert.equal((await pending).status, "saved");
    assert.equal(session.getState().phase, "dirty");
    assert.deepEqual(session.getState().draft, later);
    assert.equal(session.getState().source.blobSha, "blob-b");
    assert.equal(session.getState().lastSave.reconciled, true);
    assert.equal(session.getState().lastSave.warnings, undefined, "lost response warnings cannot be invented");
    assert.equal(writes.length, 1);
  });
}

test("confirmed original blob permits only an explicit retry using the original strong lock", async () => {
  let attempt = 0;
  const { session, writes } = setup({ save: async () => { if (++attempt === 1) throw new TypeError("Failed to fetch"); return write(); } });
  session.edit(edited);
  await session.save();
  assert.equal((await session.reconcileUnknown()).status, "not-saved");
  assert.equal(session.getState().phase, "dirty");
  assert.equal(writes.length, 1);
  await session.save();
  assert.deepEqual(writes[1][2], { ifMatch: "blob-a" });
});

test("explicit not-found after uncertain creation permits only another conditional create", async () => {
  const { session, writes } = setup({ save: async () => { throw new ApiError(0, "network", ""); }, read: async () => null });
  session.open(identity, edited, null);
  await session.save();
  assert.equal((await session.reconcileUnknown()).status, "not-saved");
  await session.save();
  assert.deepEqual(writes.map(w => w[2]), [{ ifNoneMatch: "*" }, { ifNoneMatch: "*" }]);
});

test("unrelated current content or changed original blob yields conflict without adopting its lock", async () => {
  for (const current of [source(later, revisionC, "blob-c"), source(original, revisionC, "different-blob")]) {
    const { session, writes } = setup({ save: async () => { throw new ApiError(0, "network", ""); }, read: async () => current });
    session.edit(edited);
    await session.save();
    assert.equal((await session.reconcileUnknown()).status, "conflict");
    assert.equal(session.getState().source.blobSha, "blob-a");
    assert.deepEqual(session.getState().draft, edited);
    assert.equal((await session.save()).status, "blocked");
    assert.equal(writes.length, 1);
  }
});

test("reread errors, invalid fixed response, and source deletion do not masquerade as saved", async () => {
  for (const read of [
    async () => { throw new ApiError(422, "revision_unavailable", "unavailable"); },
    async (_id, opts) => source(edited, opts.revision ? revisionC : revisionB, "blob-b"),
    async (_id, opts) => opts.revision ? null : source(edited, revisionB, "blob-b"),
  ]) {
    const { session, writes } = setup({ save: async () => { throw new ApiError(0, "network", ""); }, read });
    session.edit(edited);
    await session.save();
    assert.equal((await session.reconcileUnknown()).status, "outcome-unknown");
    assert.equal(session.getState().phase, "outcome-unknown");
    assert.deepEqual(session.getState().draft, edited);
    assert.equal((await session.save()).status, "blocked");
    assert.equal(writes.length, 1);
  }
});

test("late recovery cannot change a reopened session", async () => {
  const response = deferred();
  const { session } = setup({ save: async () => { throw new ApiError(0, "network", ""); }, read: () => response.promise });
  session.edit(edited);
  await session.save();
  const recovery = session.reconcileUnknown();
  session.open(identity, later, source(later, revisionC, "blob-c"));
  const before = session.getState();
  response.resolve(source(edited, revisionB, "blob-b"));
  assert.equal((await recovery).status, "stale");
  assert.deepEqual(session.getState(), before);
});

test("unconfigured save cannot invoke mock persistence; explicit mock results remain labelled", async () => {
  const unconfigured = setup({ mode: "unconfigured" });
  unconfigured.session.edit(edited);
  assert.equal((await unconfigured.session.save()).status, "blocked");
  assert.equal(unconfigured.session.getState().error.code, "unconfigured");
  assert.equal(unconfigured.session.getState().dirty, true);
  assert.equal(unconfigured.writes.length, 0);
  const mock = setup({ mode: "mock" });
  mock.session.edit(edited);
  assert.equal((await mock.session.save()).mode, "mock");
  assert.equal(mock.session.getState().mode, "mock");
  assert.equal(mock.session.getState().lastSave.mode, "mock");
});

test("mode changes invalidate an in-flight response and require reopening before writes", async () => {
  const response = deferred();
  const { session, setMode, writes } = setup({ save: () => response.promise });
  session.edit(edited);
  const pending = session.save();
  setMode("mock");
  response.resolve(write());
  assert.equal((await pending).status, "stale");
  assert.equal(session.getState().phase, "closed");
  assert.deepEqual(session.getState().draft, edited);
  assert.equal(session.getState().lastSave, null);
  assert.equal((await session.save()).status, "blocked");
  assert.equal(writes.length, 1);
});

test("shopping basis and items are one snapshot; saving review does not perform manual confirmation", async () => {
  const { session, writes } = setup();
  const previous = { shoppingListVersion: "1", id: "shopping", basis: { sourceRevision: revisionA, selection: [] }, items: [{ ingredientRef: "salt", decision: "available" }] };
  const reviewed = { ...previous, basis: { sourceRevision: revisionB, selection: [] }, items: [{ ingredientRef: "salt", decision: "check", previous: { basis: previous.basis, decision: "available" } }] };
  session.open({ kind: "shopping-list", id: "shopping" }, previous, source(previous));
  session.edit(reviewed);
  await session.save();
  assert.deepEqual(writes[0][1], reviewed);
  assert.deepEqual(session.getState().draft.items, reviewed.items);
  session.edit({ ...reviewed, items: [{ ingredientRef: "salt", decision: "available" }] });
  await session.save();
  assert.equal(writes.length, 2);
  assert.equal(writes[1][1].basis.sourceRevision, revisionB);
  assert.deepEqual(writes[1][1].items, [{ ingredientRef: "salt", decision: "available" }]);
});

test("subscriptions observe snapshots and cannot interfere with save; disposal stops old events", async () => {
  const { session } = setup();
  const phases = [];
  const unsubscribe = session.subscribe(state => { phases.push(state.phase); state.draft.name = { en: "observer mutation" }; });
  session.subscribe(() => { throw new Error("broken observer"); });
  session.edit(edited);
  await session.save();
  assert.deepEqual(phases, ["clean", "dirty", "saving", "saved-but-unpublished"]);
  assert.deepEqual(session.getState().draft, edited);
  unsubscribe();
  session.dispose();
  assert.equal(session.getState().phase, "closed");
  assert.equal((await session.save()).status, "blocked");
});
