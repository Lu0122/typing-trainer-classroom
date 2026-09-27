<script setup>
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  segments: { type: Array, required: true },
  showTargets: { type: Boolean, default: true },
  lowercase: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue', 'commit', 'keydown']);
const root = ref(null);
let composing = false;
let lastPublished = props.modelValue;
const totalLength = computed(() => props.segments.at(-1)?.offset + props.segments.at(-1)?.line.length || 0);
const activeIndex = computed(() => {
  const index = props.segments.findIndex(segment => props.modelValue.length < segment.offset + segment.line.length);
  return index < 0 ? Math.max(0, props.segments.length - 1) : index;
});
const visibleSegments = computed(() => {
  const start = Math.floor(activeIndex.value / 5) * 5;
  return props.segments.slice(start, start + 5);
});
const activeOffset = computed(() => props.segments[activeIndex.value]?.offset ?? 0);
const typedLine = segment => props.modelValue.slice(segment.offset, segment.offset + segment.line.length);
function charClass(index, char) {
  return index < props.modelValue.length ? (props.modelValue[index] === char ? 'correct' : 'wrong') : '';
}
function focus() {
  const input = root.value?.querySelector('input');
  input?.focus({ preventScroll: true });
  if (input && !composing) input.setSelectionRange(input.value.length, input.value.length);
}
defineExpose({ focus });
watch(() => props.modelValue, value => { lastPublished = value; });

function publish(value, input) {
  if (value === lastPublished) return;
  const hadFocus = document.activeElement === input;
  lastPublished = value;
  emit('update:modelValue', value);
  emit('commit');
  // Only move focus after committed text changes the active line. Never during IME composition.
  nextTick(() => {
    const active = root.value?.querySelector('input');
    if (hadFocus && active !== input && !composing) focus();
  });
}
function commit(event, segment) {
  if (composing || event.isComposing) return;
  let text = event.target.value;
  if (props.lowercase) text = text.toLowerCase();
  const value = (props.modelValue.slice(0, segment.offset) + text).slice(0, totalLength.value);
  publish(value, event.target);
}
function endComposition(event, segment) {
  composing = false;
  commit(event, segment);
}
function keydown(event, segment) {
  if (composing || event.isComposing || event.keyCode === 229) return;
  emit('keydown', event);
  if (event.key === 'Enter') event.preventDefault();
  if (event.key === 'Backspace' && event.target.selectionStart === 0 && event.target.selectionEnd === 0 && segment.offset > 0) {
    event.preventDefault();
    publish(props.modelValue.slice(0, segment.offset - 1), event.target);
  }
}
</script>

<template>
  <div ref="root" class="native-pinyin-lines" :class="{ 'syllable-native-input': !showTargets }">
    <div v-for="segment in visibleSegments" :key="segment.offset" class="native-pinyin-line">
      <div v-if="showTargets" class="pinyin-target-line"><span v-for="(char,index) in segment.line" :key="index" :class="charClass(segment.offset + index, char)">{{ char }}</span></div>
      <input v-if="segment.offset === activeOffset" type="text" class="native-pinyin-editor"
        :value="props.modelValue.slice(segment.offset)" :maxlength="totalLength - segment.offset"
        aria-label="拼音实际输入" autocomplete="off" autocapitalize="off" spellcheck="false"
        @compositionstart="composing = true" @compositionend="endComposition($event, segment)"
        @input="commit($event, segment)" @keydown="keydown($event, segment)" />
      <div v-else class="pinyin-typed-line" aria-label="实际输入" @click="focus"><span v-for="(char,index) in typedLine(segment)" :key="index" :class="charClass(segment.offset + index, segment.line[index])">{{ char }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.native-pinyin-lines { display: grid; gap: 7px; width: min(880px,100%); margin: 0 auto; }
.native-pinyin-line { min-width: 0; border: 1px solid #c8c8c8; background: #fff; font: 21px/1.35 SimSun,serif; }
.native-pinyin-line .pinyin-target-line { min-height: 35px; height: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.native-pinyin-editor { display: block; position: static; width: 100%; height: 35px; min-height: 35px; margin: 0; padding: 3px 6px; border: 0; border-top: 1px solid #e1e5e8; border-radius: 0; background: #fff; color: #111; caret-color: #111; font: inherit; opacity: 1; transform: none; }
.native-pinyin-editor:focus { outline: 2px solid #509cde; outline-offset: -2px; }
.native-pinyin-line .correct { color: #222; }
.native-pinyin-line .wrong { color: #c92525; background: #ffd9d6; }
.syllable-native-input { margin-top: 7px; }
.syllable-native-input .native-pinyin-line:not(:has(input)) { display: none; }
.syllable-native-input .native-pinyin-editor { height: 45px; font-family: 'Courier New',monospace; }
</style>
