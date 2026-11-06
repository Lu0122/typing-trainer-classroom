const test = require('node:test');
const assert = require('node:assert/strict');
test('battle snapshots reject old responses even when timestamps tie', async () => {
  const { isBattleSnapshotStale } = await import('../frontend/src/battle-snapshot.mjs');
  assert.equal(isBattleSnapshotStale({snapshotEpoch: 'a', snapshotVersion: 10, serverNow: 100}, {snapshotEpoch: 'a', snapshotVersion: 11, serverNow: 100}), true);
  assert.equal(isBattleSnapshotStale({snapshotEpoch: 'a', snapshotVersion: 12, serverNow: 100}, {snapshotEpoch: 'a', snapshotVersion: 11, serverNow: 100}), false);
  assert.equal(isBattleSnapshotStale({serverNow: 99}, {serverNow: 100}), true);
  assert.equal(isBattleSnapshotStale({snapshotEpoch:'new', snapshotVersion:1, serverNow:101}, {snapshotEpoch:'old', snapshotVersion:100, serverNow:100}), false);
});
