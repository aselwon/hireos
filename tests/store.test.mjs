import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { openStore } from '../lib/store.mjs';

test('retry with the same idempotency key does not duplicate a job or event', () => {
  const store = openStore();
  try {
    const input = { title: 'Operator CNC', company: 'Fabryka Demo', location: 'Łódź' };
    const first = store.mutate('job', input, 'job-create-1');
    assert.deepEqual(store.mutate('job', input, 'job-create-1'), first);
    assert.equal(store.read().jobs.length, 4);
    assert.equal(store.read().events.length, 2);
    assert.throws(
      () => store.mutate('job', { ...input, title: 'Other' }, 'job-create-1'),
      /idempotencji/
    );
    assert.equal(store.read().jobs.length, 4);
  } finally {
    store.close();
  }
});
test('stage changes require evidence note and adjacent state; rejection is not an automated stage', () => {
  const store = openStore();
  try {
    for (const input of [
      { id: 'cand-3', stage: 'decision', note: 'Komplet dokumentów' },
      { id: 'cand-3', stage: 'review', note: 'OK' },
      { id: 'cand-3', stage: 'rejected', note: 'Komplet dokumentów' },
    ]) {
      assert.throws(() => store.mutate('stage', input, crypto.randomUUID()));
    }
    assert.equal(store.read().candidates.find((c) => c.id === 'cand-3').stage, 'new');
    const state = store.mutate(
      'stage',
      { id: 'cand-3', stage: 'review', note: 'Operator sprawdził komplet materiałów.' },
      'stage-1'
    );
    assert.equal(state.candidates.find((c) => c.id === 'cand-3').stage, 'review');
    assert.match(state.events[0].detail, /Operator sprawdził/);
  } finally {
    store.close();
  }
});
test('pause blocks execution, blocked connectors cannot be marked completed, execution does not change candidate stages', () => {
  const store = openStore();
  try {
    const before = store.read().candidates;
    store.mutate('pause', { paused: true }, 'pause-1');
    assert.throws(() => store.mutate('run', { id: 'task-1' }, 'run-1'), /wstrzymana/);
    store.mutate('pause', { paused: false }, 'pause-2');
    assert.throws(() => store.mutate('run', { id: 'task-3' }, 'run-3'), /gotowe/);
    const state = store.mutate('run', { id: 'task-1' }, 'run-1');
    assert.equal(state.tasks[0].status, 'completed');
    assert.match(state.tasks[0].output, /bez wywołania AI/);
    assert.deepEqual(state.candidates, before);
    assert.throws(() => store.mutate('run', { id: 'task-1' }, 'run-2'), /gotowe/);
  } finally {
    store.close();
  }
});
test('workspace and idempotency records survive process reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hireos-'));
  const path = join(dir, 'test.sqlite');
  let store;
  try {
    store = openStore(path);
    const result = store.mutate('pause', { paused: true }, 'persist-key');
    store.close();
    store = openStore(path);
    assert.equal(store.read().paused, true);
    assert.deepEqual(store.mutate('pause', { paused: true }, 'persist-key'), result);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('invalid input is rolled back without producing audit events', () => {
  const store = openStore();
  try {
    const before = store.read();
    assert.throws(() =>
      store.mutate('job', { title: '', company: 'Demo', location: 'PL' }, 'invalid')
    );
    assert.throws(() => store.mutate('pause', { paused: 'false' }, 'invalid-pause'));
    assert.deepEqual(store.read(), before);
  } finally {
    store.close();
  }
});
