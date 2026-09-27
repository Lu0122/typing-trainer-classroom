<script setup>
defineProps({ keyboard: { type: Array, required: true }, keyClass: { type: Function, required: true } });
const emit = defineEmits(['virtual-key']);
</script>
<template>
  <div class="keyboard-wrap">
    <div class="keyboard-caption"><span>实时按键反馈</span><strong>{{ keyboard.length }} 键</strong><small>点击键盘或使用实体键，目标键会高亮</small></div>
    <div class="keyboard-scroll"><div class="keyboard-grid"><button v-for="key in keyboard" :key="key.code" :class="['keyboard-key', keyClass(key), key.size]" @mousedown.prevent="emit('virtual-key', { code: key.code, key: key.label })"><small>{{ key.secondary }}</small><b>{{ key.label }}</b></button></div></div>
  </div>
</template>
