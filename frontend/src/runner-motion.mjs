const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// Only the object behind the camera wraps. Different paving/trees keep their identity.
export function trackPosition(index, distance, count, spacing, behind = 16) {
  const length = count * spacing;
  return behind - ((index * spacing - distance) % length + length) % length;
}

// Network jitter changes a target offset, rather than jumping the animation clock.
export function createRunnerClock() {
  let offset = 0, target = 0, lastPerf = 0, lastTime = 0, initialized = false;
  return {
    sync(serverNow, sentAt, receivedAt, reset = false) {
      const estimate = serverNow - (sentAt + receivedAt) / 2;
      if (!initialized || reset || Math.abs(estimate - target) > 1500) {
        offset = estimate; lastPerf = receivedAt; lastTime = receivedAt + offset; initialized = true;
      } else this.now(receivedAt);
      target = estimate;
    },
    now(perf) {
      if (!initialized) return Date.now();
      const elapsed = Math.max(0, perf - lastPerf);
      offset += clamp(target - offset, -elapsed * .12, elapsed * .12);
      lastPerf = Math.max(lastPerf, perf); lastTime = Math.max(lastTime, perf + offset);
      return lastTime;
    }
  };
}

export function projectedDistance(state, now) {
  return (state.distance || 0) + (state.phase === 'running' ? Math.max(0, now - state.serverNow) / 1000 * state.speed : 0);
}

export function createRunnerMotion() {
  let id, phase, distance = 0;
  return {
    step(state, now, delta, connected = true) {
      const target = projectedDistance(state, now);
      if (state.id !== id || state.phase !== 'running' || phase !== 'running') distance = target;
      else if (connected) {
        const step = Math.max(0, delta) * (state.speed || 8);
        distance += step;
        // Corrections cannot reverse the world or briefly stop it between obstacles.
        distance += clamp(target - distance, -step * .15, step * .35);
      }
      id = state.id; phase = state.phase;
      return distance;
    }
  };
}

export function actionPose(action, now, deadline) {
  const progress = (now - (deadline - 560)) / 1120;
  const active = progress >= 0 && progress < 1;
  const curve = active ? Math.sin(progress * Math.PI) : 0;
  return { active, progress, jump: action === 'jump' ? curve * 2.05 : 0,
    crouch: action === 'slide' ? curve : 0, lean: action === 'left' ? -curve : action === 'right' ? curve : 0 };
}

// The crossing time remains available after a poll advances to the next task.
export function createContactTracker() {
  const tasks = new Map(), emitted = new Set(); let id, lastScore = 0;
  return {
    update(state, now, solved = false) {
      if (state.id !== id) { tasks.clear(); emitted.clear(); id = state.id; lastScore = state.score || 0; }
      const events = [], task = state.task;
      if (task) {
        const previous = tasks.get(task.sequence);
        const cleared = task.cleared || solved || previous?.cleared;
        tasks.set(task.sequence, { ...task, cleared, points: previous?.points || Math.max(0, (state.score || 0) - lastScore) });
      }
      lastScore = state.score || 0;
      if (state.event?.outcome === 'miss') {
        const key = `miss:${state.event.sequence}`;
        if (!emitted.has(key) && now >= state.event.at) {
          emitted.add(key);
          if (['running', 'finished'].includes(state.phase) && now - state.event.at < 2000)
            events.push({ kind: 'miss', action: state.event.action, lives: state.lives, sequence: state.event.sequence });
        }
      }
      if (state.phase === 'running') for (const [sequence, record] of tasks) {
        const key = `pass:${sequence}`;
        if (record.cleared && now >= record.deadline && !emitted.has(key)) {
          emitted.add(key); events.push({ kind: 'pass', action: record.action, points: record.points, sequence });
        }
        const landingKey = `land:${sequence}`;
        if (record.cleared && record.action === 'jump' && now >= record.deadline + 560 && !emitted.has(landingKey)) {
          emitted.add(landingKey); events.push({ kind: 'land', action: 'jump', sequence });
        }
        if (now > record.deadline + 2000) tasks.delete(sequence);
      }
      // Bound event bookkeeping during an unlimited run.
      if (emitted.size > 48) for (const key of emitted) { emitted.delete(key); if (emitted.size <= 24) break; }
      return events;
    },
    latestAction(now) {
      let latest;
      for (const record of tasks.values()) if (record.cleared && actionPose(record.action, now, record.deadline).active) latest = record;
      return latest;
    },
    trailingObstacle(now, currentSequence) {
      let latest;
      for (const record of tasks.values()) if (record.sequence !== currentSequence && now >= record.deadline && now < record.deadline + 1600) latest = record;
      return latest;
    }
  };
}
