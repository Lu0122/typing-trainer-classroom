const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

async function importFrontendSource(name) {
  const source = readFileSync(path.join(__dirname, '..', 'frontend', 'src', name));
  return import(`data:text/javascript;base64,${source.toString('base64')}`);
}

test('expanded practice lessons have distinct names and usable targets', async () => {
  const { extraEnglishCopy, extraPinyinCopy } = await importFrontendSource('lesson-bank.js');
  const { expandPracticeBank } = await importFrontendSource('lesson-expansion.js');
  const english = Object.fromEntries(Object.entries(extraEnglishCopy).map(([mode, lessons]) => [mode, [...lessons]]));
  const pinyin = Object.fromEntries(Object.entries(extraPinyinCopy).map(([mode, lessons]) => [mode, [...lessons]]));
  expandPracticeBank(english, pinyin);

  for (const lessons of [...Object.values(english), ...Object.values(pinyin)]) {
    assert.equal(new Set(lessons.map((lesson) => lesson.selector)).size, lessons.length);
    assert.ok(lessons.every((lesson) => (lesson.content || lesson.target || lesson.lines?.join('')).length > 0));
  }
  assert.ok(pinyin['pinyin-syllable'].some((lesson) => lesson.syllables.some((item) => item.pinyin.length > 1)));
  for (const lesson of pinyin['pinyin-syllable']) {
    assert.equal(lesson.target, lesson.syllables.map((item) => item.pinyin).join(''));
  }
});

test('practice course position survives reopening in the same browser', async () => {
  const values = new Map();
  global.window = { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  } };
  try {
    const { readPracticeIndex, savePracticeIndex } = await importFrontendSource('practice-progress.mjs');
    assert.equal(readPracticeIndex('english-word'), 0);
    savePracticeIndex('english-word', 7);
    assert.equal(readPracticeIndex('english-word'), 7);
    assert.equal(readPracticeIndex('pinyin-word'), 0);
    savePracticeIndex('english-word', -1);
    assert.equal(readPracticeIndex('english-word'), 7);
    values.set('typing-practice-index-v1:english-word', 'invalid');
    assert.equal(readPracticeIndex('english-word'), 0);
  } finally {
    delete global.window;
  }
});
