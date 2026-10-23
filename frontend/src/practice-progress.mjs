const storagePrefix = 'typing-practice-index-v1:';

export function readPracticeIndex(mode) {
  try {
    const saved = window.localStorage.getItem(storagePrefix + mode);
    if (saved === null) return 0;
    const index = Number(saved);
    return Number.isSafeInteger(index) && index >= 0 ? index : 0;
  } catch {
    return 0;
  }
}

export function savePracticeIndex(mode, index) {
  if (!Number.isSafeInteger(index) || index < 0) return;
  try { window.localStorage.setItem(storagePrefix + mode, String(index)); } catch { /* 私密浏览模式仍可继续练习 */ }
}
