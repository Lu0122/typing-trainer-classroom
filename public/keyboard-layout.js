(function exposeKeyboardLayout(root, factory) {
  const layout = factory();
  if (typeof module === 'object' && module.exports) module.exports = layout;
  else root.KeyboardLayout = layout;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createKeyboardLayout() {
  const key = (code, label, size = 'w1', secondary = '') => ({ code, label, size, secondary });

  const macroKeys = Array.from({ length: 12 }, (_, index) => key(`F${index + 13}`, `M${index + 1}`));
  const extendedRows = [[
    ...macroKeys,
    key('AudioVolumeDown', '音量−'), key('AudioVolumeUp', '音量+'), key('AudioVolumeMute', '静音'),
    key('MediaTrackPrevious', '上一首'), key('MediaPlayPause', '播放'), key('MediaTrackNext', '下一首'),
    key('MediaStop', '停止'), key('LaunchMediaPlayer', '媒体'),
    key('LaunchApplication1', '计算器'), key('LaunchMail', '邮件'), key('BrowserHome', '主页'), key('Power', '电源')
  ]];

  const functionRows = [[
    key('Escape', 'Esc', 'w125'),
    ...Array.from({ length: 12 }, (_, index) => key(`F${index + 1}`, `F${index + 1}`)),
    key('PrintScreen', 'PrtSc'), key('ScrollLock', 'ScrLk'), key('Pause', 'Pause')
  ]];

  const typingRows = [
    [
      key('Backquote', '`', 'w1', '~'),
      key('Digit1', '1', 'w1', '!'), key('Digit2', '2', 'w1', '@'), key('Digit3', '3', 'w1', '#'),
      key('Digit4', '4', 'w1', '$'), key('Digit5', '5', 'w1', '%'), key('Digit6', '6', 'w1', '^'),
      key('Digit7', '7', 'w1', '&'), key('Digit8', '8', 'w1', '*'), key('Digit9', '9', 'w1', '('),
      key('Digit0', '0', 'w1', ')'), key('Minus', '-', 'w1', '_'), key('Equal', '=', 'w1', '+'),
      key('Backspace', 'Backspace', 'w2')
    ],
    [
      key('Tab', 'Tab', 'w15'), ...'QWERTYUIOP'.split('').map((letter) => key(`Key${letter}`, letter)),
      key('BracketLeft', '[', 'w1', '{'), key('BracketRight', ']', 'w1', '}'), key('Backslash', '\\', 'w15', '|')
    ],
    [
      key('CapsLock', 'Caps', 'w175'), ...'ASDFGHJKL'.split('').map((letter) => key(`Key${letter}`, letter)),
      key('Semicolon', ';', 'w1', ':'), key('Quote', "'", 'w1', '"'), key('Enter', 'Enter', 'w225')
    ],
    [
      key('ShiftLeft', 'Shift', 'w225'), ...'ZXCVBNM'.split('').map((letter) => key(`Key${letter}`, letter)),
      key('Comma', ',', 'w1', '<'), key('Period', '.', 'w1', '>'), key('Slash', '/', 'w1', '?'), key('ShiftRight', 'Shift', 'w275')
    ],
    [
      key('ControlLeft', 'Ctrl', 'w125'), key('MetaLeft', 'Win', 'w125'), key('AltLeft', 'Alt', 'w125'),
      key('Space', 'Space', 'w6'), key('AltRight', 'Alt', 'w125'), key('Fn', 'Fn', 'w125'),
      key('ContextMenu', 'Menu', 'w125'), key('ControlRight', 'Ctrl', 'w125')
    ]
  ];

  const navigationRows = [
    [key('Insert', 'Ins'), key('Home', 'Home'), key('PageUp', 'PgUp')],
    [key('Delete', 'Del'), key('End', 'End'), key('PageDown', 'PgDn')],
    [key('ArrowUp', '↑')],
    [key('ArrowLeft', '←'), key('ArrowDown', '↓'), key('ArrowRight', '→')]
  ];

  const numpadRows = [
    [key('NumLock', 'Num'), key('NumpadDivide', '/'), key('NumpadMultiply', '*'), key('NumpadSubtract', '−')],
    [key('Numpad7', '7'), key('Numpad8', '8'), key('Numpad9', '9'), key('NumpadAdd', '+')],
    [key('Numpad4', '4'), key('Numpad5', '5'), key('Numpad6', '6')],
    [key('Numpad1', '1'), key('Numpad2', '2'), key('Numpad3', '3'), key('NumpadEnter', 'Enter')],
    [key('Numpad0', '0', 'w2'), key('NumpadDecimal', '.')]
  ];

  const groups = { extendedRows, functionRows, typingRows, navigationRows, numpadRows };
  const keys = Object.values(groups).flat(2);
  if (keys.length !== 128) throw new Error(`Virtual keyboard must contain 128 keys, received ${keys.length}`);
  if (new Set(keys.map((item) => item.code)).size !== 128) throw new Error('Virtual keyboard contains duplicate key codes');

  return { ...groups, keys, count: keys.length };
}));
