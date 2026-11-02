import assert from 'node:assert/strict';
import test from 'node:test';

import { collectAlerts, deduplicateAlerts } from '../ops/hireos-monitor.mjs';

test('monitor thresholds detect unhealthy health, stale backup, low disk, AI cap and 5xx', () => {
  assert.deepEqual(
    collectAlerts({
      healthOk: false,
      backupAgeMs: 27 * 60 * 60 * 1000,
      freeBytes: 100,
      aiCapReached: true,
      errors5xx: 1,
    }),
    ['healthz', 'backup-stale', 'disk-low', 'ai-cap', 'http-5xx']
  );
  assert.deepEqual(
    collectAlerts({
      healthOk: true,
      backupAgeMs: 60_000,
      freeBytes: 2 * 1024 ** 3,
      aiCapReached: false,
      errors5xx: 0,
    }),
    []
  );
  assert.deepEqual(
    collectAlerts({
      healthOk: true,
      backupAgeMs: null,
      freeBytes: 2 * 1024 ** 3,
      aiCapReached: false,
      errors5xx: 0,
    }),
    ['backup-stale']
  );
});

test('alert deduplication suppresses repeats for one hour and allows them after', () => {
  const first = deduplicateAlerts(['disk-low', 'ai-cap'], {}, 100_000);
  assert.deepEqual(first.emitted, ['disk-low', 'ai-cap']);
  assert.deepEqual(
    deduplicateAlerts(['disk-low', 'ai-cap'], first.state, 100_000 + 59 * 60_000).emitted,
    []
  );
  assert.deepEqual(
    deduplicateAlerts(['disk-low', 'ai-cap'], first.state, 100_000 + 60 * 60_000).emitted,
    ['disk-low', 'ai-cap']
  );
  assert.deepEqual(deduplicateAlerts(['healthz'], first.state, 100_001).emitted, ['healthz']);
});
