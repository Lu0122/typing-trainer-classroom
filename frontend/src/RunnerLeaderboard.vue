<script setup>
import { RotateCw, Trophy } from 'lucide-vue-next';
defineProps({ board: Object, period: String, language: String, loading: Boolean, error: String });
defineEmits(['period', 'refresh']);
</script>
<template>
  <section class="runner-ranking" aria-label="遗迹逃亡排行榜">
    <header><div><Trophy :size="20"/><h2>最远逃亡榜</h2></div><button class="runner-icon-button" aria-label="刷新排行榜" :disabled="loading" @click="$emit('refresh')"><RotateCw :size="16"/></button></header>
    <div class="runner-rank-tabs" aria-label="排行榜时间"><button v-for="item in [['all','总榜'],['today','今日']]" :key="item[0]" :aria-pressed="period === item[0]" @click="$emit('period',item[0])">{{ item[1] }}</button><span>{{ language === 'chinese' ? '中文' : '英文' }}组</span></div>
    <p v-if="error" role="status" class="runner-rank-empty">{{ error }} <button @click="$emit('refresh')">重试</button></p>
    <p v-else-if="!board?.rows.length" class="runner-rank-empty">{{ loading ? '正在加载纪录…' : '第一份逃亡纪录，等你留下。' }}</p>
    <ol v-else><li v-for="row in board.rows" :key="row.userId" :class="{ 'is-me': row.isCurrentUser }"><b class="runner-rank-number">{{ row.rank }}</b><div><strong>{{ row.name }}<small v-if="row.isCurrentUser">你</small></strong><span>第 {{ row.level }} 关 · {{ row.accuracy }}% 准确率</span></div><b>{{ row.distance.toLocaleString() }}<small>米</small></b></li></ol>
    <footer v-if="board?.myBest"><span>我的最佳 · 第 {{ board.myBest.rank }} 名</span><strong>{{ board.myBest.distance.toLocaleString() }} m</strong></footer>
    <footer v-else><span>每人保留最远纪录</span><small>{{ board?.total || 0 }} 人上榜</small></footer>
  </section>
</template>
