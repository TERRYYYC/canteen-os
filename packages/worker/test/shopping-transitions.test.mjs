/** L1 FakeRepo endpoint evidence only. Expected lists are hand-written, not core output. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeRepo, WORKER, bearer, call, makeEnv } from './helpers.mjs';

const worker = (await import(WORKER)).default;
const LIST_PATH = 'data/shopping-lists/trip.json';
const PLAN_PATH = 'data/menu-plans/team.json';
const selection = [{ menuPlanRef: 'team', date: '2026-10-19', mealType: 'lunch' }];
const json = (value) => `${JSON.stringify(value)}\n`;
const copy = (value) => structuredClone(value);

function knowledge() {
  return {
    [PLAN_PATH]: json({ schemaVersion: '3', meals: [
      { date: '2026-10-19', mealType: 'lunch', dishRef: 'soup', plannedServings: 2 },
    ] }),
    'data/dishes/soup.json': json({ schemaVersion: '3', name: { zh: '汤' }, status: 'draft', baseServings: 2,
      components: [
        { ingredientRef: 'tomato', qty: { value: 100, unit: 'g' } },
        { ingredientRef: 'salt' },
        { ingredientRef: 'tomato', qty: { value: 20, unit: 'g' } },
      ],
    }),
    'data/ingredients/salt.json': json({ schemaVersion: '2', name: { zh: '盐' }, baseUnit: 'g', trackStock: true, onHand: 500, role: 'seasoning' }),
    'data/ingredients/tomato.json': json({ schemaVersion: '2', name: { zh: '番茄' }, baseUnit: 'g', trackStock: false }),
    'data/techniques.json': '[]\n',
    'data/purchase-orders/protected.json': 'existing purchase order bytes\n',
    'data/notes.txt': 'unrelated bytes\n',
  };
}

function listAt(revision, items = [
  { ingredientRef: 'salt', decision: 'check' },
  { ingredientRef: 'tomato', decision: 'check' },
]) {
  return { shoppingListVersion: '1', id: 'trip', basis: { sourceRevision: revision, selection: copy(selection) }, items: copy(items) };
}

function setup(editKnowledge = (files) => files) {
  const repo = new FakeRepo();
  const files = editKnowledge(knowledge());
  const revision = repo.commit(files, 'saved source');
  return { repo, files, revision, env: makeEnv(repo).env };
}

function persistList(state, list) {
  state.repo.commit({ ...state.files, [LIST_PATH]: json(list) }, 'saved shopping decisions');
}

function currentBlob(repo) {
  return repo.trees.get(repo.commits.get(repo.head).tree).get(LIST_PATH);
}

function save(state, list, { create = false, blobSha = currentBlob(state.repo) } = {}) {
  return call(worker, state.env, 'POST', '/shopping-list/trip', {
    headers: { ...bearer('buyer'), ...(create ? { 'If-None-Match': '*' } : { 'If-Match': blobSha }) },
    body: list,
  });
}

async function readSaved(state, expected) {
  const read = await call(worker, state.env, 'GET', '/source/shopping-list/trip', { headers: bearer('buyer') });
  assert.equal(read.status, 200, read.text);
  assert.deepEqual(read.body.content, expected);
  assert.equal(read.body.blobSha, currentBlob(state.repo));
  assert.equal(read.body.commit, state.repo.head);
  return read.body;
}

function assertFailure(result, status, code, path) {
  assert.equal(result.status, status, result.text);
  assert.equal(result.body.ok, false);
  assert.ok(result.body.errors.some((error) => error.code === code && (path === undefined || error.path === path)), result.text);
  if (code !== 'review_required') assert.equal(Object.hasOwn(result.body, 'reviewRequired'), false);
}

function assertUntouched(state) {
  for (const [path, bytes] of Object.entries(state.files)) assert.equal(state.repo.fileText(path), bytes, path);
}

test('shopping create persists all candidates as check, including unknown seasoning and duplicate recipe sources', async () => {
  const state = setup();
  const expected = listAt(state.revision);
  const result = await save(state, expected, { create: true });
  assert.equal(result.status, 200, result.text);
  assert.equal(result.body.ok, true);
  await readSaved(state, expected);
  assertUntouched(state);
});

for (const item of [
  { ingredientRef: 'salt', decision: 'buy' },
  { ingredientRef: 'salt', decision: 'buy', bought: true },
  { ingredientRef: 'salt', decision: 'available' },
]) test(`shopping create rejects first-write judgment ${JSON.stringify(item)}`, async () => {
  const state = setup();
  const list = listAt(state.revision);
  list.items[0] = item;
  const before = state.repo.head;
  assertFailure(await save(state, list, { create: true }), 400, 'invalid_selection', '/items/0/decision');
  assert.equal(state.repo.head, before);
  assert.equal(state.repo.writeCalls().length, 0);
});

for (const [name, mutate, path] of [
  ['missing candidate', (items) => items.slice(0, 1), '/items'],
  ['extra candidate', (items) => [...items, { ingredientRef: 'extra', decision: 'check' }], '/items/2/ingredientRef'],
  ['duplicate candidate', (items) => [...items, copy(items[0])], '/items/2/ingredientRef'],
]) test(`shopping create rejects ${name} with a field path`, async () => {
  const state = setup();
  const list = listAt(state.revision);
  list.items = mutate(list.items);
  assertFailure(await save(state, list, { create: true }), 400, 'invalid_selection', path);
  assert.equal(state.repo.writeCalls().length, 0);
});

test('shopping create cannot invent schema-valid previous judgment', async () => {
  const state = setup();
  const list = listAt(state.revision);
  list.items[0].previous = { basis: copy(list.basis), decision: 'buy', bought: true };
  assertFailure(await save(state, list, { create: true }), 400, 'invalid_selection', '/items/0/previous');
  assert.equal(state.repo.writeCalls().length, 0);
});

test('shopping same-basis explicit manual check clears previous and leaves knowledge unchanged', async () => {
  const state = setup();
  const original = listAt(state.revision);
  original.items[0].previous = { basis: copy(original.basis), decision: 'buy', bought: true };
  persistList(state, original);
  const expected = listAt(state.revision);
  const result = await save(state, expected);
  assert.equal(result.status, 200, result.text);
  await readSaved(state, expected);
  assertUntouched(state);
});

test('shopping same-basis update cannot rewrite an existing previous judgment', async () => {
  const state = setup();
  const original = listAt(state.revision);
  original.items[0].previous = { basis: copy(original.basis), decision: 'buy', bought: true };
  persistList(state, original);
  const forged = copy(original);
  forged.items[0].previous.bought = false;
  const before = state.repo.head;
  const result = await save(state, forged);
  assertFailure(result, 400, 'invalid_selection');
  assert.ok(result.body.errors.some((error) => error.path.startsWith('/items/0/previous')), result.text);
  assert.equal(state.repo.head, before);
  assert.equal(state.repo.writeCalls().length, 0);
});

test('shopping same-basis candidate equality is checked before accepting manual decisions', async () => {
  const state = setup();
  const original = listAt(state.revision);
  persistList(state, original);
  const incomplete = copy(original);
  incomplete.items = [{ ingredientRef: 'salt', decision: 'available' }];
  assertFailure(await save(state, incomplete), 400, 'invalid_selection', '/items');
  assert.equal(state.repo.writeCalls().length, 0);
});

test('shopping changed basis requires saved check+previous before a separately locked bought decision', async () => {
  const state = setup();
  const original = listAt(state.revision, [
    { ingredientRef: 'salt', decision: 'buy', bought: true },
    { ingredientRef: 'tomato', decision: 'available' },
  ]);
  persistList(state, original);
  const plan = JSON.parse(state.files[PLAN_PATH]);
  plan.meals[0].plannedServings = 3;
  state.files[PLAN_PATH] = json(plan);
  const nextRevision = state.repo.commit({ ...state.files, [LIST_PATH]: json(original) }, 'saved changed serving input');
  const nextBasis = { sourceRevision: nextRevision, selection: copy(selection) };
  const oldLock = currentBlob(state.repo);
  const bypass = { ...copy(original), basis: nextBasis };
  const rejected = await save(state, bypass);
  assertFailure(rejected, 409, 'review_required');
  assert.deepEqual(rejected.body.reviewRequired, ['salt', 'tomato']);
  assert.equal(state.repo.writeCalls().length, 0);
  assert.equal(state.repo.fileText(LIST_PATH), json(original));

  const reconciled = { shoppingListVersion: '1', id: 'trip', basis: nextBasis, items: [
    { ingredientRef: 'salt', decision: 'check', previous: { basis: copy(original.basis), decision: 'buy', bought: true } },
    { ingredientRef: 'tomato', decision: 'check', previous: { basis: copy(original.basis), decision: 'available' } },
  ] };
  const switched = await save(state, reconciled);
  assert.equal(switched.status, 200, switched.text);
  const saved = await readSaved(state, reconciled);
  assert.notEqual(saved.blobSha, oldLock);

  const confirmed = { ...copy(reconciled), items: [
    { ingredientRef: 'salt', decision: 'buy', bought: true },
    { ingredientRef: 'tomato', decision: 'available' },
  ] };
  const writesBeforeStale = state.repo.writeCalls().length;
  assertFailure(await save(state, confirmed, { blobSha: oldLock }), 409, 'conflict');
  assert.equal(state.repo.writeCalls().length, writesBeforeStale);
  const result = await save(state, confirmed, { blobSha: saved.blobSha });
  assert.equal(result.status, 200, result.text);
  await readSaved(state, confirmed);
  assertUntouched(state);
});

test('shopping basis-only revision change cannot use empty reviewRequired as permission to change a decision', async () => {
  const state = setup();
  const original = listAt(state.revision, [
    { ingredientRef: 'salt', decision: 'buy', bought: true },
    { ingredientRef: 'tomato', decision: 'available' },
  ]);
  persistList(state, original);
  const nextRevision = state.repo.commit({ ...state.files, [LIST_PATH]: json(original) }, 'same demand, later saved revision');
  const forged = { ...copy(original), basis: { sourceRevision: nextRevision, selection: copy(selection) } };
  forged.items[0] = { ingredientRef: 'salt', decision: 'available' };
  const result = await save(state, forged);
  assertFailure(result, 409, 'review_required');
  assert.deepEqual(result.body.reviewRequired, []);
  assert.equal(state.repo.writeCalls().length, 0);
});

for (const mode of ['clear previous', 'remove item by switching to empty plan']) test(`shopping unavailable stored previous cannot be bypassed by ${mode}`, async () => {
  const state = setup();
  const original = listAt(state.revision);
  original.items[0].previous = { basis: { sourceRevision: 'f'.repeat(40), selection: copy(selection) }, decision: 'buy', bought: true };
  persistList(state, original);
  let requested = listAt(state.revision);
  if (mode.startsWith('remove')) {
    state.files[PLAN_PATH] = json({ schemaVersion: '3', meals: [] });
    const emptyRevision = state.repo.commit({ ...state.files, [LIST_PATH]: json(original) }, 'saved empty plan');
    requested = listAt(emptyRevision, []);
  }
  const before = state.repo.head;
  assertFailure(await save(state, requested), 422, 'basis_unavailable');
  assert.equal(state.repo.head, before);
  assert.equal(state.repo.fileText(LIST_PATH), json(original));
  assert.equal(state.repo.writeCalls().length, 0);
});

test('shopping unresolved ingredient stays check while other ingredients can be decided', async () => {
  const state = setup((files) => { delete files['data/ingredients/salt.json']; return files; });
  const original = listAt(state.revision);
  const created = await save(state, original, { create: true });
  assert.equal(created.status, 200, created.text);
  await readSaved(state, original);
  for (const decision of [
    { ingredientRef: 'salt', decision: 'buy' },
    { ingredientRef: 'salt', decision: 'buy', bought: true },
    { ingredientRef: 'salt', decision: 'available' },
  ]) {
    const invalid = copy(original);
    invalid.items[0] = decision;
    const before = state.repo.head;
    const writesBefore = state.repo.writeCalls().length;
    assertFailure(await save(state, invalid), 422, 'unresolved_reference');
    assert.equal(state.repo.head, before);
    assert.equal(state.repo.writeCalls().length, writesBefore);
  }
  const expected = listAt(state.revision, [
    { ingredientRef: 'salt', decision: 'check' },
    { ingredientRef: 'tomato', decision: 'available' },
  ]);
  const result = await save(state, expected);
  assert.equal(result.status, 200, result.text);
  await readSaved(state, expected);
  assertUntouched(state);
});

test('shopping repeated demand changes keep only the last manual judgment as previous', async () => {
  const state = setup();
  const original = listAt(state.revision, [
    { ingredientRef: 'salt', decision: 'buy', bought: true },
    { ingredientRef: 'tomato', decision: 'available' },
  ]);
  persistList(state, original);
  const plan = JSON.parse(state.files[PLAN_PATH]);
  plan.meals[0].plannedServings = 3;
  state.files[PLAN_PATH] = json(plan);
  const middleRevision = state.repo.commit({ ...state.files, [LIST_PATH]: json(original) }, 'first changed demand');
  const pending = listAt(middleRevision, [
    { ingredientRef: 'salt', decision: 'check', previous: { basis: copy(original.basis), decision: 'buy', bought: true } },
    { ingredientRef: 'tomato', decision: 'check', previous: { basis: copy(original.basis), decision: 'available' } },
  ]);
  const firstChange = await save(state, pending);
  assert.equal(firstChange.status, 200, firstChange.text);
  await readSaved(state, pending);

  plan.meals[0].plannedServings = 4;
  state.files[PLAN_PATH] = json(plan);
  const nextRevision = state.repo.commit({ ...state.files, [LIST_PATH]: state.repo.fileText(LIST_PATH) }, 'second changed demand');
  const expected = listAt(nextRevision, [
    { ingredientRef: 'salt', decision: 'check', previous: { basis: copy(original.basis), decision: 'buy', bought: true } },
    { ingredientRef: 'tomato', decision: 'check', previous: { basis: copy(original.basis), decision: 'available' } },
  ]);
  const forged = copy(expected);
  forged.items[0].previous = { basis: copy(pending.basis), decision: 'check' };
  const writesBefore = state.repo.writeCalls().length;
  const rejected = await save(state, forged);
  assertFailure(rejected, 409, 'review_required');
  assert.deepEqual(rejected.body.reviewRequired, ['salt', 'tomato']);
  assert.equal(state.repo.writeCalls().length, writesBefore);

  const accepted = await save(state, expected);
  assert.equal(accepted.status, 200, accepted.text);
  await readSaved(state, expected);
  for (const item of expected.items) {
    assert.equal(Object.hasOwn(item, 'bought'), false);
    assert.equal(Object.hasOwn(item.previous, 'previous'), false);
    assert.equal(item.previous.basis.sourceRevision, state.revision);
  }
  assertUntouched(state);
});

test('shopping saved empty plan removes bought items and a later saved re-add starts fresh check', async () => {
  const state = setup();
  const originalPlan = JSON.parse(state.files[PLAN_PATH]);
  const original = listAt(state.revision, [
    { ingredientRef: 'salt', decision: 'buy', bought: true },
    { ingredientRef: 'tomato', decision: 'available' },
  ]);
  persistList(state, original);
  const boughtRevision = state.repo.head;

  async function saveAndReadPlan(value) {
    const planBlob = state.repo.trees.get(state.repo.commits.get(state.repo.head).tree).get(PLAN_PATH);
    const saved = await call(worker, state.env, 'POST', '/plan/team', {
      headers: { ...bearer('chef'), 'If-Match': planBlob }, body: value,
    });
    assert.equal(saved.status, 200, saved.text);
    const read = await call(worker, state.env, 'GET', '/source/plan/team', { headers: bearer('chef') });
    assert.equal(read.status, 200, read.text);
    assert.deepEqual(read.body.content, value);
    assert.equal(read.body.commit, saved.body.commit);
    assert.equal(read.body.blobSha, saved.body.blobSha);
    state.files[PLAN_PATH] = state.repo.fileText(PLAN_PATH);
    return read.body.commit;
  }

  const emptyRevision = await saveAndReadPlan({ schemaVersion: '3', meals: [] });
  const empty = listAt(emptyRevision, []);
  const cleared = await save(state, empty);
  assert.equal(cleared.status, 200, cleared.text);
  await readSaved(state, empty);

  const history = await call(worker, state.env, 'GET', `/source/shopping-list/trip?revision=${boughtRevision}`, {
    headers: bearer('buyer'),
  });
  assert.equal(history.status, 200, history.text);
  assert.equal(history.body.commit, boughtRevision);
  assert.deepEqual(history.body.content, original);
  assert.equal(history.body.content.items[0].bought, true);

  const readdedRevision = await saveAndReadPlan(originalPlan);
  const resurrected = listAt(readdedRevision, original.items);
  const writesBefore = state.repo.writeCalls().length;
  assertFailure(await save(state, resurrected), 409, 'review_required');
  assert.equal(state.repo.writeCalls().length, writesBefore);
  const expected = listAt(readdedRevision, [
    { ingredientRef: 'salt', decision: 'check' },
    { ingredientRef: 'tomato', decision: 'check' },
  ]);
  const restarted = await save(state, expected);
  assert.equal(restarted.status, 200, restarted.text);
  await readSaved(state, expected);
  assertUntouched(state);
});

for (const event of ['select an additional empty dinner', 'replace dish with the same ingredients']) {
  test(`shopping ${event} requires review although its ingredient IDs are unchanged`, async () => {
    const state = setup();
    const original = listAt(state.revision, [
      { ingredientRef: 'salt', decision: 'buy', bought: true },
      { ingredientRef: 'tomato', decision: 'available' },
    ]);
    persistList(state, original);
    let nextRevision = state.revision;
    const nextSelection = copy(selection);
    if (event.startsWith('select')) {
      nextSelection.push({ menuPlanRef: 'team', date: '2026-10-20', mealType: 'dinner' });
    } else {
      state.files['data/dishes/another-soup.json'] = state.files['data/dishes/soup.json'];
      const plan = JSON.parse(state.files[PLAN_PATH]);
      plan.meals[0].dishRef = 'another-soup';
      state.files[PLAN_PATH] = json(plan);
      nextRevision = state.repo.commit({ ...state.files, [LIST_PATH]: json(original) }, 'saved replacement dish');
    }
    const nextBasis = { sourceRevision: nextRevision, selection: nextSelection };
    const rejected = await save(state, { ...copy(original), basis: nextBasis });
    assertFailure(rejected, 409, 'review_required');
    assert.deepEqual(rejected.body.reviewRequired, ['salt', 'tomato']);
    assert.equal(state.repo.writeCalls().length, 0);
    const expected = { shoppingListVersion: '1', id: 'trip', basis: nextBasis, items: [
      { ingredientRef: 'salt', decision: 'check', previous: { basis: copy(original.basis), decision: 'buy', bought: true } },
      { ingredientRef: 'tomato', decision: 'check', previous: { basis: copy(original.basis), decision: 'available' } },
    ] };
    const accepted = await save(state, expected);
    assert.equal(accepted.status, 200, accepted.text);
    await readSaved(state, expected);
    assertUntouched(state);
  });
}
