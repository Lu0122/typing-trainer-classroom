export const TRACK_START = 145 * Math.PI / 180;
export function chasePoint(position, trackMeters = 520, radius = 26, depth = 18) {
  const angle = TRACK_START + position / trackMeters * Math.PI * 2;
  const length = Math.hypot(radius * Math.sin(angle), depth * Math.cos(angle));
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * depth, angle,
    tx: -radius * Math.sin(angle) / length, tz: depth * Math.cos(angle) / length };
}

// Ease confirmed positions only. Displayed speed never invents running distance.
export function createChaseMotion() {
  const positions = new Map(); let round;
  return {
    step(state, delta) {
      if (round !== state.round) { positions.clear(); round = state.round; }
      const caught = state.phase === 'finished' && state.result?.outcome === 'caught' && !state.result?.left;
      const thief = state.players?.find(player => player.role === 'thief');
      const players = (state.players || []).map(player => {
        const target = caught && thief ? thief.position : player.position || 0;
        let current = positions.get(player.id);
        if (current === undefined || !['running', 'finished'].includes(state.phase)) current = target;
        const before = current;
        current += (target - current) * (1 - Math.exp(-Math.max(0, delta) * 18));
        if (Math.abs(target - current) < .002) current = target;
        positions.set(player.id, current);
        return { ...player, position: current, moved: current - before };
      });
      for (const id of positions.keys()) if (!players.some(player => player.id === id)) positions.delete(id);
      return players;
    }
  };
}
