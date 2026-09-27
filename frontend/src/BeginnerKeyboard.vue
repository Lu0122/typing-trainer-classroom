<script setup>
import { computed, ref } from 'vue';
import { ChevronDown, FileText } from 'lucide-vue-next';

const props = defineProps({
  rows: { type: Array, required: true },
  targetCode: { type: String, default: '' },
  pressedCode: { type: String, default: '' },
  wrongCode: { type: String, default: '' }
});
const emit = defineEmits(['virtual-key']);
const showExtended = ref(false);

const fingerClass = (code) => {
  const groups = {
    'finger-purple': ['Backquote', 'Digit1', 'Tab', 'KeyQ', 'CapsLock', 'KeyA', 'ShiftLeft', 'KeyZ', 'ControlLeft', 'MetaLeft', 'Backslash', 'BracketRight', 'Enter', 'ShiftRight', 'Slash', 'ControlRight', 'ContextMenu'],
    'finger-blue': ['Digit2', 'KeyW', 'KeyS', 'KeyX', 'AltLeft', 'Digit4', 'Digit5', 'KeyR', 'KeyT', 'KeyF', 'KeyG', 'KeyV', 'KeyB', 'Space', 'Digit6', 'Digit7', 'KeyY', 'KeyU', 'KeyH', 'KeyJ', 'KeyN', 'KeyM', 'AltRight'],
    'finger-pink': ['Digit3', 'KeyE', 'KeyD', 'KeyC', 'Digit8', 'KeyI', 'KeyK', 'Comma', 'Digit9', 'KeyO', 'KeyL', 'Period', 'Digit0', 'Minus', 'Equal', 'KeyP', 'BracketLeft', 'Semicolon', 'Quote']
  };
  return Object.entries(groups).find(([, codes]) => codes.includes(code))?.[0] || 'finger-purple';
};

const keyStyle = (key) => {
  const units = { w1: 1, w125: 1.25, w15: 1.5, w175: 1.75, w2: 2, w225: 2.25, w275: 2.75, w6: 6 };
  return { '--key-units': units[key.size] || 1 };
};

const keyLabel = (key) => key.code === 'CapsLock' ? 'Caps Lock' : key.label;

const standardCount = computed(() => props.rows.flat().length);
</script>

<template>
  <section class="beginner-keyboard" aria-label="标准键位练习键盘">
    <div class="beginner-keyboard-board">
      <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="beginner-keyboard-row">
        <button
          v-for="key in row"
          :key="key.code"
          type="button"
          :style="keyStyle(key)"
          :class="[
            'beginner-key',
            fingerClass(key.code),
            {
              'is-target': targetCode === key.code,
              'is-pressed': pressedCode === key.code,
              'is-wrong': wrongCode === key.code,
              'is-home-anchor': key.code === 'KeyF' || key.code === 'KeyJ'
            }
          ]"
          :aria-label="key.label"
          @mousedown.prevent="emit('virtual-key', { code: key.code, key: key.label })"
        >
          <span v-if="key.code.includes('Meta')" class="windows-logo" aria-hidden="true">
            <i v-for="pane in 4" :key="pane"></i>
          </span>
          <FileText v-else-if="key.code === 'ContextMenu'" :size="19"/>
          <template v-else>
            <small v-if="key.secondary">{{ key.secondary }}</small>
            <strong :class="{ 'is-backspace': key.code === 'Backspace' }">{{ keyLabel(key) }}</strong>
          </template>
          <i v-if="key.code === 'KeyF' || key.code === 'KeyJ'"></i>
        </button>
      </div>
    </div>
    <button class="extended-toggle" type="button" @click="showExtended = !showExtended">
      <span>标准键位 {{ standardCount }} 键 · 完整键盘支持 128 键</span>
      <ChevronDown :size="14" :class="{ 'is-open': showExtended }" />
    </button>
    <div v-if="showExtended" class="extended-note">F1–F24、导航区、数字键盘及媒体键仍会实时响应实体按键。</div>
  </section>
</template>
