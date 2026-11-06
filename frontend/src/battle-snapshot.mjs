export function isBattleSnapshotStale(incoming, current) {
  if (!incoming || !current) return false;
  if (incoming.snapshotEpoch && incoming.snapshotEpoch === current.snapshotEpoch && Number.isSafeInteger(incoming.snapshotVersion) && Number.isSafeInteger(current.snapshotVersion)) {
    return incoming.snapshotVersion < current.snapshotVersion;
  }
  return Number.isFinite(incoming.serverNow) && Number.isFinite(current.serverNow) && incoming.serverNow < current.serverNow;
}
