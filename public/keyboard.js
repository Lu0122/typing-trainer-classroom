(function initializeVirtualKeyboard() {
  const layout = window.KeyboardLayout;
  const container = document.querySelector('#virtual-keyboard');
  if (!layout || !container) return;

  const keyElements = new Map();
  const lastKeyName = document.querySelector('#last-key-name');
  const lastKeyCode = document.querySelector('#last-key-code');
  const keyCount = document.querySelector('#keyboard-key-count');
  const keyboardScroll = document.querySelector('.keyboard-scroll');
  keyCount.textContent = `${layout.count} 键`;

  function renderKey(item) {
    const element = document.createElement('span');
    element.className = `keyboard-key ${item.size}`;
    element.dataset.code = item.code;
    element.setAttribute('role', 'button');
    element.setAttribute('aria-label', `${item.label} (${item.code})`);
    element.setAttribute('tabindex', '-1');
    element.title = `${item.label} · ${item.code}`;
    if (item.secondary) {
      const secondary = document.createElement('small'); secondary.textContent = item.secondary;
      const primary = document.createElement('strong'); primary.textContent = item.label;
      element.append(secondary, primary);
    } else {
      element.textContent = item.label;
    }
    keyElements.set(item.code, element);
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (isSensitiveInput(document.activeElement)) {
        clearPressedKeys();
        lastKeyName.textContent = '安全输入已隐藏';
        lastKeyCode.textContent = '密码按键不会显示';
        return;
      }
      keyElements.forEach((keyElement) => keyElement.classList.remove('is-last'));
      element.classList.add('is-pressed', 'is-last');
      lastKeyName.textContent = item.label;
      lastKeyCode.textContent = item.code;
      window.dispatchEvent(new CustomEvent('virtual-keydown', { detail: { code: item.code, repeat: false } }));
    });
    element.addEventListener('pointerup', () => element.classList.remove('is-pressed', 'is-repeating'));
    element.addEventListener('pointercancel', () => element.classList.remove('is-pressed', 'is-repeating'));
    element.addEventListener('pointerleave', () => element.classList.remove('is-pressed', 'is-repeating'));
    return element;
  }

  function renderRows(rows, className) {
    const section = document.createElement('div');
    section.className = className;
    rows.forEach((row) => {
      const rowElement = document.createElement('div');
      rowElement.className = 'keyboard-row';
      row.forEach((item) => rowElement.append(renderKey(item)));
      section.append(rowElement);
    });
    return section;
  }

  const utility = renderRows(layout.extendedRows, 'keyboard-utility');
  const functions = renderRows(layout.functionRows, 'keyboard-functions');
  const deck = document.createElement('div'); deck.className = 'keyboard-deck';
  deck.append(
    renderRows(layout.typingRows, 'keyboard-typing'),
    renderRows(layout.navigationRows, 'keyboard-navigation'),
    renderRows(layout.numpadRows, 'keyboard-numpad')
  );
  container.replaceChildren(utility, functions, deck);

  function isSensitiveInput(target) {
    return target instanceof HTMLInputElement && target.type === 'password';
  }

  function clearPressedKeys() {
    keyElements.forEach((element) => element.classList.remove('is-pressed', 'is-repeating'));
  }

  window.addEventListener('virtual-key-target', (event) => {
    keyElements.forEach((element) => element.classList.toggle('is-target', element.dataset.code === event.detail?.code));
  });

  document.addEventListener('keydown', (event) => {
    if (isSensitiveInput(event.target)) {
      clearPressedKeys();
      lastKeyName.textContent = '安全输入已隐藏';
      lastKeyCode.textContent = '密码按键不会显示';
      return;
    }

    const element = keyElements.get(event.code);
    keyElements.forEach((keyElement) => keyElement.classList.remove('is-last'));
    if (element) {
      element.classList.add('is-pressed', 'is-last');
      element.classList.toggle('is-repeating', event.repeat);
      const layoutKey = layout.keys.find((item) => item.code === event.code);
      lastKeyName.textContent = layoutKey?.label || event.key;
      lastKeyCode.textContent = event.repeat ? `${event.code} · 连续按下` : event.code;
      const keyRect = element.getBoundingClientRect();
      const scrollRect = keyboardScroll.getBoundingClientRect();
      if (keyRect.left < scrollRect.left || keyRect.right > scrollRect.right) {
        keyboardScroll.scrollBy({ left: keyRect.left - scrollRect.left - (scrollRect.width - keyRect.width) / 2, behavior: 'smooth' });
      }
    } else {
      lastKeyName.textContent = event.key === 'Process' ? '输入法组合键' : (event.key || '未知按键');
      lastKeyCode.textContent = event.code || '未映射';
    }
  });

  document.addEventListener('keyup', (event) => {
    const element = keyElements.get(event.code);
    element?.classList.remove('is-pressed', 'is-repeating');
  });

  window.addEventListener('blur', clearPressedKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPressedKeys(); });
}());
