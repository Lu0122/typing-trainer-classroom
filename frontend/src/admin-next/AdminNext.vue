<script setup>
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
const Students = defineAsyncComponent(() => import('./Students.vue'));
const Classes = defineAsyncComponent(() => import('./Classes.vue'));
const TeachingViews = defineAsyncComponent(() => import('./TeachingViews.vue'));
const SystemViews = defineAsyncComponent(() => import('./SystemViews.vue'));
const CompetitionView = defineAsyncComponent(() => import('./CompetitionView.vue'));
const OverviewCharts = defineAsyncComponent(() => import('./OverviewCharts.vue'));
import { ElMessage } from 'element-plus';

const labels = {overview:'概览',passages:'练习文章',assignments:'教学任务',progress:'学习进步',competitions:'比赛赛事',scores:'竞速成绩',users:'学生账号',classes:'班级分组',admins:'后台账号',agent:'管理助手','agent-logs':'助手审计','ai-settings':'AI 服务设置','bug-reports':'意见反馈'};
const groups = [{title:'教学管理',items:['passages','assignments','progress']},{title:'赛事成绩',items:['competitions','scores']},{title:'账号管理',items:['users','classes','admins']},{title:'AI 与系统',items:['agent','agent-logs','ai-settings','bug-reports']}];
const view = ref(labels[location.hash.slice(1)] ? location.hash.slice(1) : 'overview');
const sidebarOpen = ref(true);
const menuRef = ref(null);
const initialOpenGroups = groups.filter(group => group.items.includes(view.value)).map(group => group.title);
function openActiveGroup() { const group = groups.find(item => item.items.includes(view.value)); if (group) menuRef.value?.open(group.title); }
const stats = ref(null);
function syncView(){ view.value = labels[location.hash.slice(1)] ? location.hash.slice(1) : 'overview'; openActiveGroup(); if (view.value === 'overview' && admin.value) loadStats(); if (view.value === 'bug-reports' && admin.value) loadReports(); }
function navigate(name){ if(view.value===name){syncView();return} location.hash=name; }
async function loadStats(){ try{stats.value=await api('/api/admin/stats')}catch(e){ElMessage.error(e.message)} }
const admin = ref(null), checking = ref(true), busy = ref(false), loading = ref(false);
const login = reactive({ username: 'admin', password: '' });
const loginError = ref(''), error = ref(''), rows = ref([]), total = ref(0), page = ref(1), pageSize = ref(20);
const query = reactive({ q: '', status: '', priority: '' });
const detail = ref(null), nextStatus = ref(''), saving = ref(false);
let requestId = 0;
const statusOptions = ['待处理', '处理中', '已处理'];
const priorities = [{value:'P0',label:'P0 阻断'}, {value:'P1',label:'P1 严重'}, {value:'P2',label:'P2 一般'}, {value:'P3',label:'P3 轻微'}];
const fields = computed(() => detail.value ? [
  ['前置条件', detail.value.preconditions], ['复现步骤', detail.value.steps], ['测试数据', detail.value.testData],
  ['预期结果', detail.value.expectedResult], ['实际结果', detail.value.actualResult], ['运行环境', detail.value.environment]
].filter(([, value]) => String(value || '').trim()) : []);
const stamp = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—';
const bugCode = id => `BUG-${String(id).padStart(5, '0')}`;
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } }); }
  catch { throw new Error('无法连接教师机，请检查网络或服务状态。'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/admin/login') { admin.value = null; loginError.value = '登录已失效，请重新登录。'; }
    throw new Error(data.message || '操作失败，请稍后重试。');
  }
  return data;
}
async function loadReports() {
  const id = ++requestId; loading.value = true; error.value = '';
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize.value), q: query.q.trim(), status: query.status, priority: query.priority });
    const result = await api(`/api/admin/bug-reports?${params}`);
    if (id !== requestId) return;
    rows.value = result.rows || []; total.value = result.total || 0; page.value = result.page || 1;
  } catch (e) { if (id === requestId) error.value = e.message; }
  finally { if (id === requestId) loading.value = false; }
}
async function signIn() {
  if (busy.value) return; busy.value = true; loginError.value = '';
  try { const data = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(login) }); admin.value = data.admin; login.password = ''; if(view.value==='overview') await loadStats(); else if(view.value==='bug-reports') await loadReports(); }
  catch (e) { loginError.value = e.message; } finally { busy.value = false; }
}
async function signOut() {
  try { await api('/api/admin/logout', { method: 'POST' }); admin.value = null; rows.value = []; }
  catch (e) { ElMessage.error(e.message); }
}
function search() { page.value = 1; loadReports(); }
function openDetail(row) { detail.value = row; nextStatus.value = row.status; }
async function saveStatus() {
  if (!detail.value || saving.value) return;
  saving.value = true;
  try {
    await api(`/api/admin/bug-reports/${detail.value.id}/status`, { method:'PATCH', body: JSON.stringify({status: nextStatus.value}) });
    detail.value = null; ElMessage.success('反馈状态已更新'); await loadReports();
  } catch(e) { ElMessage.error(e.message); } finally { saving.value = false; }
}
onMounted(async () => {
  try { const data = await api('/api/admin/me'); admin.value = data.authenticated ? data.admin : null; if (admin.value) { if(view.value==='overview') await loadStats(); else if(view.value==='bug-reports') await loadReports(); } }
  catch (e) { loginError.value = e.message; } finally { checking.value = false; }
});
function sessionExpired(){ admin.value = null; loginError.value = '登录已失效，请重新登录。'; }
window.addEventListener('hashchange', syncView);
window.addEventListener('admin-session-expired', sessionExpired);
onBeforeUnmount(() => { window.removeEventListener('hashchange', syncView); window.removeEventListener('admin-session-expired', sessionExpired); });
</script>

<template>
  <div v-if="checking" class="initial-status" role="status">正在连接教师机…</div>
  <main v-else-if="!admin" class="login-page">
    <section class="login-intro"><a href="/" class="brand"><b>字</b> 字练场 <span>教师后台</span></a><div><p class="kicker">CLASSROOM MANAGEMENT</p><h1>课堂管理，<br>一目了然。</h1><p>登录教师账号，管理学生、课程与现场比赛。</p></div><small>教师后台 · 课堂管理</small></section>
    <section class="login-card"><div><p class="kicker">欢迎回来</p><h2>登录管理后台</h2><p>使用已有的后台账号登录。</p></div><el-form label-position="top" @submit.prevent="signIn"><el-form-item label="后台账号"><el-input v-model.trim="login.username" autocomplete="username" size="large" /></el-form-item><el-form-item label="密码"><el-input v-model="login.password" type="password" show-password autocomplete="current-password" size="large" /></el-form-item><p v-if="loginError" class="form-error" role="alert">{{ loginError }}</p><el-button type="primary" native-type="submit" size="large" :loading="busy" class="full-button">登录</el-button></el-form><a href="/admin-legacy.html">打开原版后台</a></section>
  </main>
  <div v-else class="admin-layout">
    <aside v-show="sidebarOpen" id="admin-sidebar" class="sidebar"><a class="brand" href="/"><b>字</b> 字练场 <span>教师后台</span></a><nav aria-label="后台导航" class="side-nav"><el-menu ref="menuRef" class="admin-menu" :default-active="view" :default-openeds="initialOpenGroups" @select="navigate"><el-menu-item index="overview">概览</el-menu-item><el-sub-menu v-for="group in groups" :key="group.title" :index="group.title"><template #title><span>{{ group.title }}</span></template><el-menu-item v-for="key in group.items" :key="key" :index="key">{{ labels[key] }}</el-menu-item></el-sub-menu></el-menu></nav><div class="sidebar-bottom"><a href="/admin-legacy.html">打开原版后台</a><br/><a href="/">打开练习前台</a><br/><a href="https://github.com/Lu0122/typing-trainer-classroom" target="_blank" rel="noopener">GitHub 开源仓库</a></div></aside>
    <div class="workspace"><header class="topbar"><div class="topbar-location"><button type="button" class="sidebar-toggle" :aria-expanded="sidebarOpen" aria-controls="admin-sidebar" :aria-label="sidebarOpen ? '收起侧边栏' : '展开侧边栏'" :title="sidebarOpen ? '收起侧边栏' : '展开侧边栏'" @click="sidebarOpen=!sidebarOpen"><span aria-hidden="true">{{ sidebarOpen ? '☰ ←' : '☰ →' }}</span></button><span>教师后台 <i>/</i> {{labels[view]}}</span></div><div><span>{{ admin.displayName || admin.username }}</span><el-button link @click="signOut">退出登录</el-button></div></header>
      <main class="content" :class="{ 'content--table': ['users','classes','passages','assignments','progress','scores','bug-reports','competitions','admins','agent-logs'].includes(view) }">
      <template v-if="view==='overview'"><div class="page-heading"><div><p class="kicker">课堂管理</p><h1>教学概览</h1><p>查看学生练习与课堂数据。</p></div><el-button @click="loadStats">刷新</el-button></div><div v-if="stats" class="overview-grid"><section v-for="[label,value,note] in [['学生账号',stats.registeredUsers,stats.participants+' 人参加竞速'],['竞速次数',stats.attempts,'累计挑战'],['平均成绩',stats.averageScore,'正确字数'],['最高成绩',stats.topScore,'正确字数'],['启用文章',stats.activePassages,'篇'] ]" :key="label" class="overview-card"><span>{{label}}</span><strong>{{value}}</strong><small>{{note}}</small></section></div><OverviewCharts :api="api" /></template>
      <Students v-else-if="view==='users'" :api="api" />
      <Classes v-else-if="view==='classes'" :api="api" />
      <TeachingViews v-else-if="['passages','assignments','progress','scores'].includes(view)" :key="view" :view="view" />
      <SystemViews v-else-if="['admins','agent','agent-logs','ai-settings'].includes(view)" :key="view" :view="view" :api="api" :admin="admin" />
      <CompetitionView v-else-if="view==='competitions'" :api="api" />
      <template v-else-if="view==='bug-reports'"><div class="page-heading"><div><p class="kicker">学生反馈</p><h1>意见反馈</h1><p>查看学生提交的问题，跟进处理进度。</p></div><el-button @click="loadReports" :loading="loading">刷新列表</el-button></div>
        <section class="report-panel"><div class="panel-heading"><div><h2>反馈列表</h2><p>共 {{ total }} 条记录</p></div></div>
          <form class="filters" @submit.prevent="search"><el-input v-model="query.q" placeholder="搜索标题或学生姓名" clearable aria-label="搜索反馈" class="search-input" @clear="search"/><el-select v-model="query.status" placeholder="全部状态" clearable aria-label="按状态筛选" @change="search"><el-option v-for="s in statusOptions" :key="s" :label="s" :value="s"/></el-select><el-select v-model="query.priority" placeholder="全部优先级" clearable aria-label="按优先级筛选" @change="search"><el-option v-for="p in priorities" :key="p.value" :label="p.label" :value="p.value"/></el-select><el-button type="primary" native-type="submit">查询</el-button></form>
          <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error-alert"/>
          <el-table v-loading="loading" :data="rows" height="100%" empty-text="暂无反馈" class="report-table"><el-table-column label="反馈" min-width="240"><template #default="scope"><strong class="report-title">{{ scope.row.title }}</strong><span class="report-code">{{ bugCode(scope.row.id) }}</span></template></el-table-column><el-table-column prop="displayName" label="学生" min-width="100"/><el-table-column label="优先级" width="100"><template #default="scope"><el-tag :type="scope.row.priority === 'P0' || scope.row.priority === 'P1' ? 'danger' : 'info'" effect="plain">{{ scope.row.priority }}</el-tag></template></el-table-column><el-table-column label="状态" width="110"><template #default="scope"><el-tag :type="scope.row.status === '已处理' ? 'success' : scope.row.status === '处理中' ? 'warning' : 'info'" effect="light">{{ scope.row.status }}</el-tag></template></el-table-column><el-table-column label="提交时间" min-width="170"><template #default="scope">{{ stamp(scope.row.createdAt) }}</template></el-table-column><el-table-column label="附件" width="80"><template #default="scope">{{ scope.row.hasAttachment ? '有附件' : '—' }}</template></el-table-column><el-table-column label="操作" width="100" fixed="right"><template #default="scope"><el-button link type="primary" @click="openDetail(scope.row)">查看详情</el-button></template></el-table-column></el-table>
          <div class="table-footer"><span>显示 {{ rows.length }} 条</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="total" layout="sizes, prev, pager, next" @size-change="page=1; loadReports()" @current-change="loadReports"/></div>
        </section></template></main>
    </div>
    <el-dialog :model-value="!!detail" @update:model-value="value => { if (!value && !saving) detail = null }" :close-on-click-modal="!saving" :show-close="!saving" width="min(620px, 92vw)" title="反馈详情"><template v-if="detail"><p class="detail-code">{{ bugCode(detail.id) }} · {{ detail.priority }}</p><h2 class="detail-title">{{ detail.title }}</h2><p class="detail-meta">{{ detail.displayName }} · {{ stamp(detail.createdAt) }}<template v-if="detail.frequency"> · {{ detail.frequency }}</template></p><div v-for="[label, value] in fields" :key="label" class="detail-field"><strong>{{ label }}</strong><p>{{ value }}</p></div><a v-if="detail.hasAttachment" :href="`/api/admin/bug-reports/${detail.id}/attachment`" target="_blank" rel="noopener">查看附件 ↗</a><div class="status-edit"><span>处理状态</span><el-select v-model="nextStatus" aria-label="处理状态"><el-option v-for="s in statusOptions" :key="s" :label="s" :value="s"/></el-select></div></template><template #footer><el-button :disabled="saving" @click="detail = null">关闭</el-button><el-button type="primary" :loading="saving" @click="saveStatus">保存状态</el-button></template></el-dialog>
  </div>
</template>
