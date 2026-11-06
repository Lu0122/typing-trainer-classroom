// Each record has its own storage key so independent tabs cannot overwrite a whole queue.
export function createTrainingQueue({ storage, send, currentUserId, onChange = () => {}, onSaved = () => {}, schedule = setTimeout, cancel = clearTimeout, random = Math.random }) {
  const prefix = 'typing-training-v1:';
  const memory = new Map();
  let timer = null, running = false, stopped = false, attempts = 0, blocked = '', storageProblem = false;

  function itemsFor(userId) {
    const entries = new Map(memory);
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        try {
          const item = JSON.parse(storage.getItem(key));
          if (item && String(item.userId) === String(userId) && item.payload?.sourceKey) entries.set(key, item);
        } catch { /* preserve malformed data for diagnosis */ }
      }
    } catch { storageProblem = true; }
    return [...entries.entries()].filter(([, item]) => String(item.userId) === String(userId));
  }
  function notify() {
    const id = currentUserId();
    const items = id == null ? [] : itemsFor(id);
    onChange({ count: items.length, blocked, storageProblem, saving: running });
  }
  function queue(userId, payload) {
    const key = `${prefix}${encodeURIComponent(String(userId))}:${encodeURIComponent(payload.sourceKey)}`;
    const item = { userId, payload };
    try { storage.setItem(key, JSON.stringify(item)); }
    catch { storageProblem = true; memory.set(key, item); }
    blocked = '';
    notify();
    flush();
  }
  function retryLater() {
    if (stopped || timer) return;
    const ms = Math.min(60000, 3000 * 2 ** Math.min(attempts++, 5)) + random() * 1000;
    timer = schedule(() => { timer = null; flush(); }, ms);
  }
  async function flush() {
    if (running || stopped || blocked || currentUserId() == null) return;
    const userId = currentUserId();
    const next = itemsFor(userId)[0];
    if (!next) { notify(); return; }
    running = true; notify();
    try {
      const [key, item] = next;
      if (String(currentUserId()) !== String(userId)) return;
      await send(item.payload, userId);
      // Delete only after the server acknowledges this exact record.
      memory.delete(key);
      try { storage.removeItem(key); } catch { storageProblem = true; blocked = '无法更新本地待保存记录，请联系老师。'; }
      attempts = 0;
      onSaved(userId);
    } catch (error) {
      if (error?.status && error.status < 500 && ![408, 429].includes(error.status)) {
        blocked = error.status === 401 || error.status === 403 || error.status === 409
          ? '登录状态已变化，请重新登录原账号后重试。'
          : '部分练习记录未能保存，请联系老师。';
      } else retryLater();
    } finally {
      running = false; notify();
      if (!stopped && !blocked && !timer && currentUserId() != null && itemsFor(currentUserId()).length) {
        timer = schedule(() => { timer = null; flush(); }, 250);
      }
    }
  }
  function retry() { blocked = ''; if (timer) { cancel(timer); timer = null; } notify(); flush(); }
  function userChanged() { blocked = ''; if (timer) { cancel(timer); timer = null; } notify(); flush(); }
  function destroy() { stopped = true; if (timer) cancel(timer); }
  return { queue, retry, userChanged, destroy, notify };
}
