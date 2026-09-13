/** Read-only L1 evidence for overall run completion, independent of mapped progress. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeRepo, WORKER, bearer, call, makeEnv } from './helpers.mjs';
const worker = (await import(WORKER)).default;
const { STAGE_STEPS } = await import('../dist/endpoints/publish.js');
const started = '2026-10-19T09:00:00Z';

function scenario({ status = 'in_progress', conclusion = null, stepName = STAGE_STEPS.validate[0], stepConclusion = null, minutes = 1 } = {}) {
  const repo = new FakeRepo();
  const head = repo.commit({ 'data/techniques.json': '[]' });
  const run = { id: 555, name: 'publish · known-request', status, conclusion, head_sha: head,
    html_url: 'https://example.invalid/actions/runs/555', created_at: started, run_started_at: started };
  repo.runs.push(run);
  repo.jobsByRun.set(555, [{ id: 1, name: 'build', status: 'in_progress', conclusion: null,
    started_at: started, completed_at: null,
    steps: [{ name: stepName, status: stepConclusion === null ? 'in_progress' : 'completed',
      conclusion: stepConclusion, started_at: started, completed_at: stepConclusion === null ? null : started }] }]);
  const { env, clock } = makeEnv(repo);
  clock.t = Date.parse(started) + minutes * 60_000;
  return { repo, run, env, head };
}

async function read(state, role = 'buyer', path = '/publish/555') {
  const response = await call(worker, state.env, 'GET', path, { headers: bearer(role) });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.body.runId, 555);
  assert.equal(state.repo.head, state.head);
  assert.equal(state.repo.writeCalls().length, 0);
  assert.equal(state.repo.dispatches.length, 0);
  return response.body;
}

test('a failed step does not prove an in-progress run completed', async () => {
  const state = scenario({ stepConclusion: 'failure' });
  const body = await read(state);
  assert.equal(body.status, 'failure');
  assert.equal(body.failedStep, 'validate');
  assert.equal(body.failureReason, STAGE_STEPS.validate[0]);
  assert.equal(body.runCompleted, false);
  assert.equal(body.runConclusion, null);
});

for (const conclusion of ['success', 'failure', 'cancelled', 'timed_out', null, 'future-conclusion']) {
  test(`completed run preserves ${JSON.stringify(conclusion)} independently of job progress`, async () => {
    const body = await read(scenario({ status: 'completed', conclusion }));
    assert.equal(body.runCompleted, true);
    assert.equal(body.runConclusion, conclusion);
    assert.equal(body.status, conclusion === 'success' ? 'success' : 'failure');
    assert.equal(body.steps[0].state, 'in_progress');
  });
}

test('missing upstream conclusion stays null when a run has completed', async () => {
  const state = scenario({ status: 'completed' });
  delete state.run.conclusion;
  const body = await read(state);
  assert.equal(body.runCompleted, true);
  assert.equal(body.runConclusion, null);
  assert.equal(body.status, 'failure');
});

for (const status of ['queued', 'waiting', null, undefined]) {
  test(`upstream status ${String(status)} is not completion even with a conclusion`, async () => {
    const state = scenario({ conclusion: 'success' });
    if (status === undefined) delete state.run.status;
    else state.run.status = status;
    const body = await read(state);
    assert.equal(body.runCompleted, false);
    assert.equal(body.runConclusion, 'success');
    assert.notEqual(body.status, 'success');
  });
}

test('wall-clock timeout is independent of overall run completion', async () => {
  const body = await read(scenario({ minutes: 25 }));
  assert.equal(body.status, 'timeout');
  assert.equal(body.slow, true);
  assert.equal(body.runCompleted, false);
  assert.equal(body.runConclusion, null);
});

test('slow progress does not manufacture completion or a conclusion', async () => {
  const body = await read(scenario({ minutes: 12 }));
  assert.equal(body.status, 'in_progress');
  assert.equal(body.slow, true);
  assert.equal(body.runCompleted, false);
  assert.equal(body.runConclusion, null);
});

for (const status of ['in_progress', 'completed']) {
  test(`unmapped progress remains independent from ${status} terminal evidence`, async () => {
    const body = await read(scenario({ status, conclusion: 'cancelled', stepName: 'New workflow step', minutes: 25 }));
    assert.equal(body.status, 'unmapped');
    assert.deepEqual(body.unmappedSteps, ['New workflow step']);
    assert.equal(body.runCompleted, status === 'completed');
    assert.equal(body.runConclusion, 'cancelled');
  });
}

for (const role of ['chef', 'buyer', 'admin']) {
  test(`known run ID is read directly for ${role} even when a newer run exists`, async () => {
    const state = scenario({ status: 'completed', conclusion: 'failure' });
    state.repo.runs.unshift({ ...state.run, id: 999, name: 'publish · someone-else', conclusion: 'success' });
    const body = await read(state, role);
    assert.equal(body.runCompleted, true);
    assert.equal(body.runConclusion, 'failure');
    assert.ok(state.repo.calls.some(c => c.path.endsWith('/actions/runs/555')));
    assert.ok(state.repo.calls.every(c => !c.path.includes('/actions/workflows/') && !c.path.endsWith('/actions/runs/999')));
  });
}

test('latest uses the shared evidence fields without changing POST claim behavior', async () => {
  const body = await read(scenario({ status: 'completed', conclusion: 'timed_out' }), 'buyer', '/publish/latest');
  assert.equal(body.runCompleted, true);
  assert.equal(body.runConclusion, 'timed_out');
});
