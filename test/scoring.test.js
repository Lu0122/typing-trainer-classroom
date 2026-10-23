const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreTyping, visibleCharacters } = require('../backend/scoring');

test('ignores whitespace when counting Chinese typing characters', () => {
  assert.deepEqual(visibleCharacters('你 好\n中国'), ['你', '好', '中', '国']);
});

test('calculates correct characters, errors and accuracy', () => {
  assert.deepEqual(scoreTyping('中文打字', '中又打字'), {
    score: 3,
    typedCount: 4,
    wrong: 1,
    accuracy: 75,
    completed: true
  });
});

test('does not count pasted overflow beyond target', () => {
  assert.deepEqual(scoreTyping('你好', '你好世界'), {
    score: 2,
    typedCount: 2,
    wrong: 0,
    accuracy: 100,
    completed: true
  });
});
