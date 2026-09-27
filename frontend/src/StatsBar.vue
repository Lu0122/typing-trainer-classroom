<script setup>
import { CircleGauge, Clock3, FileText, Gauge, Pause, RotateCcw, Target } from 'lucide-vue-next';

defineProps({
  seconds: { type: Number, default: 0 },
  speed: { type: Number, default: 0 },
  progress: { type: Number, default: 0 },
  accuracy: { type: Number, default: 100 }
});
defineEmits(['reset']);
</script>

<template>
  <div class="metrics-bar">
    <div class="metric-time"><Clock3 :size="17"/><b>时间</b><strong>{{ String(Math.floor(seconds / 60)).padStart(2,'0') }}:{{ String(seconds % 60).padStart(2,'0') }}</strong></div>
    <div class="metric-speed"><Gauge :size="17"/><b>速度</b><strong>{{ speed }} 字/分</strong></div>
    <div class="metric-progress"><Target :size="17"/><b>进度</b><strong>{{ progress }}%</strong></div>
    <div class="metric-accuracy"><CircleGauge :size="17"/><b>正确率</b><strong>{{ accuracy }}%</strong></div>
    <div class="metric-actions"><button type="button" title="重新开始" @click="$emit('reset')"><RotateCcw :size="22"/></button><button type="button" title="暂停"><Pause :size="20"/></button><button type="button" title="练习说明"><FileText :size="19"/></button></div>
  </div>
</template>
