// 画面和按键共用一个单调时钟，网络校时只缓慢改变推进速度。
export function createRhythmClock() {
  let round, phase, anchor = 0, anchorAt = 0, correction = 0, correctionMs = 500;
  const read = (now) => phase === 'running'
    ? Math.max(0, anchor + (now - anchorAt) + correction * Math.min(1, Math.max(0, (now - anchorAt) / correctionMs)))
    : 0;
  return {
    read,
    sync(data, receivedAt, roundTripMs = 0) {
      const incoming = Math.max(0, Number(data.elapsed) || 0) + Math.max(0, roundTripMs) / 2;
      const current = read(receivedAt);
      if (round !== data.round || phase !== data.phase) { anchor = incoming; correction = 0; }
      else { anchor = current; correction = incoming - current; }
      correctionMs = Math.max(500, Math.abs(correction) * 10);
      anchorAt = receivedAt; round = data.round; phase = data.phase;
    },
  };
}

export function rhythmPhysicalKey(event) {
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return null;
  // 中文输入法会把 key 改成 Process；音游按物理字母键识别，文字输入框仍由调用方排除。
  if (/^Key[A-Z]$/.test(event.code || '')) return event.code.slice(3);
  if (event.isComposing || !/^[a-z]$/i.test(event.key || '')) return null;
  return event.key.toUpperCase();
}

export function rhythmPosition(note, elapsed, fallMs, judgeRatio = 0.76) {
  const p = (elapsed - (note.at - fallMs)) / Math.max(1, fallMs);
  return { p, top: 7 + p * (judgeRatio * 100 - 7) };
}

export function predictRhythmPress(notes, key, at, resolved, windows = {}) {
  let best = null;
  for (const note of notes) {
    const offset = Math.abs(at - note.at);
    if (resolved.has(note.id) || note.letter !== key || offset > (windows.goodMs ?? 210)) continue;
    if (!best || offset < Math.abs(best.offsetMs)) best = { noteId: note.id, lane: note.lane, offsetMs: Math.round(at - note.at) };
  }
  if (!best) return { noteId: -1, grade: 'miss', offsetMs: 0 };
  const offset = Math.abs(best.offsetMs);
  return { ...best, grade: offset <= (windows.perfectMs ?? 70) ? 'perfect' : offset <= (windows.greatMs ?? 130) ? 'great' : 'good' };
}
