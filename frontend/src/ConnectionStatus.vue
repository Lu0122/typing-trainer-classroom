<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

const emit = defineEmits(['reconnected']);
const state = ref('checking');
let timer, controller, stopped = false, failures = 0, wasDisconnected = false;

function schedule(delay) {
  clearTimeout(timer);
  if (!stopped) timer = setTimeout(check, delay);
}
async function check() {
  if (stopped || controller) return;
  controller = new AbortController();
  const current = controller;
  const timeout = setTimeout(() => current.abort(), 5000);
  try {
    const response = await fetch('/api/health', { cache: 'no-store', signal: current.signal });
    const data = await response.json();
    if (!response.ok || data.status !== 'ok' || data.app !== 'hanzi-sprint') throw new Error('unavailable');
    if (stopped) return;
    failures = 0;
    state.value = 'connected';
    if (wasDisconnected) { wasDisconnected = false; emit('reconnected'); }
  } catch {
    if (stopped) return;
    failures++;
    if (failures >= 2 || navigator.onLine === false) {
      state.value = 'disconnected';
      wasDisconnected = true;
    }
  } finally {
    clearTimeout(timeout);
    controller = null;
    schedule(state.value === 'disconnected' || failures ? 4000 + Math.random() * 2000 : 25000 + Math.random() * 10000);
  }
}
function retry() {
  clearTimeout(timer);
  if (!controller) check();
}
function onOffline() {
  failures = 2;
  state.value = 'disconnected';
  wasDisconnected = true;
  retry();
}
function onVisibility() { if (document.visibilityState === 'visible') retry(); }
onMounted(() => {
  window.addEventListener('online', retry);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisibility);
  check();
});
onBeforeUnmount(() => {
  stopped = true;
  clearTimeout(timer);
  controller?.abort();
  window.removeEventListener('online', retry);
  window.removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisibility);
});
</script>

<template>
  <aside v-if="state === 'disconnected'" class="connection-notice" role="status" aria-live="polite">
    <span class="connection-notice-dot" aria-hidden="true"></span>
    <div><strong>暂时无法连接教师机</strong><p>正在自动重连。请检查网络，或请老师确认程序正在运行。</p></div>
    <button type="button" @click="retry">重试</button>
  </aside>
</template>
