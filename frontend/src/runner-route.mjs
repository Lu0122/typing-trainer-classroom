export const TURN_LENGTH = 20, TURN_ANGLE = Math.PI / 3;
const ease = value => value * value * (3 - 2 * value);

// A metre-spaced cache keeps curved scenery inexpensive to sample every frame.
export function createRouteSampler(turns = []) {
  const sorted = [...turns].sort((a, b) => a.distance - b.distance);
  const initial = sorted[0]?.from || 0;
  const start = Math.floor((sorted[0]?.distance || 0) - 180);
  const end = Math.ceil((sorted.at(-1)?.distance || 0) + 240);
  const points = new Float64Array((end - start + 1) * 2);
  function heading(distance) {
    let angle = initial;
    for (const turn of sorted) {
      if (distance < turn.distance) break;
      if (distance >= turn.distance + TURN_LENGTH) angle = turn.to;
      else { angle = turn.from + (turn.to - turn.from) * ease((distance - turn.distance) / TURN_LENGTH); break; }
    }
    return angle;
  }
  for (let i = 1; i <= end - start; i++) {
    const angle = heading(start + i - .5);
    points[i * 2] = points[(i - 1) * 2] + Math.sin(angle);
    points[i * 2 + 1] = points[(i - 1) * 2 + 1] - Math.cos(angle);
  }
  return {
    sample(distance, result = {}) {
      const index = Math.max(0, Math.min(end - start, Math.floor(distance - start)));
      const at = start + index, fraction = distance - at, angle = heading(distance);
      if (distance < start || distance >= end) {
        result.x = points[index * 2] + Math.sin(angle) * fraction;
        result.z = points[index * 2 + 1] - Math.cos(angle) * fraction;
      } else {
        result.x = points[index * 2] + (points[(index + 1) * 2] - points[index * 2]) * fraction;
        result.z = points[index * 2 + 1] + (points[(index + 1) * 2 + 1] - points[index * 2 + 1]) * fraction;
      }
      result.heading = angle; return result;
    }
  };
}

export function planRoute(state, direction = 'left') {
  const turns = [...(state.routeTurns || [])]; let heading = turns.at(-1)?.to || 0;
  for (const task of [state.task, ...(state.upcoming || [])]) {
    if (task?.action !== 'fork' || !Number.isFinite(task.routeAt) || turns.some(turn => turn.sequence === task.sequence)) continue;
    // Keep the junction visible while recovery holds the runner at its entrance.
    // Only the server's routeTurns commit a choice to the continued run.
    if (task === state.task && state.phase === 'finished') continue;
    const choice = task === state.task ? task.cleared ? task.selection : direction : 'left';
    const to = heading + (choice === 'left' ? -TURN_ANGLE : TURN_ANGLE);
    turns.push({ sequence: task.sequence, distance: task.routeAt, from: heading, to, direction: choice }); heading = to;
  }
  return turns;
}
