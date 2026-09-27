const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../public/keyboard-layout');

test('virtual keyboard contains exactly 128 unique key codes', () => {
  assert.equal(layout.count, 128);
  assert.equal(new Set(layout.keys.map((key) => key.code)).size, 128);
});

test('virtual keyboard covers typing, modifiers, navigation, numpad and extended keys', () => {
  const codes = new Set(layout.keys.map((key) => key.code));
  for (const requiredCode of [
    'KeyA', 'Digit1', 'ShiftLeft', 'ControlRight', 'Space', 'Enter',
    'ArrowUp', 'Delete', 'Numpad0', 'NumpadEnter', 'F1', 'F24',
    'AudioVolumeMute', 'MediaPlayPause', 'LaunchMail', 'Power'
  ]) {
    assert.equal(codes.has(requiredCode), true, `${requiredCode} should be represented`);
  }
});
