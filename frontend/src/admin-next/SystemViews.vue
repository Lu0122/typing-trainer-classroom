<script setup>
import { ref, reactive, watch, onBeforeUnmount } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

const props = defineProps({ view: { type: String, required: true }, api: { type: Function, required: true }, admin: { type: Object, required: true } });
const busy = ref(false), error = ref(''), rows = ref([]), total = ref(0), page = ref(1), pageSize = ref(20);
const filters = reactive({ q: '', role: '', isActive: '', range: '' });
const showCreate = ref(false), account = reactive({ username:'', displayName:'', password:'', role:'manager' });
const settings = reactive({ provider:'', model:'', baseUrl:'', apiKey:'', rolePrompt:'', enabled:false, apiKeyConfigured:false });
const settingsMessage = ref(''), savingSettings = ref(false), testingSettings = ref(false);
const conversations = ref([]), conversationId = ref(null), messages = ref([]), input = ref(''), sending = ref(false), progress = ref('');
const preview = ref(null), previewLoading = ref(false), previewRows = ref([]), previewError = ref('');
let controller, listRequest = 0;
const conversationStorageKey = `typing-agent-conversation:${props.admin.id}`;
function rememberConversation(id) { try { if (id) localStorage.setItem(conversationStorageKey, String(id)); else localStorage.removeItem(conversationStorageKey); } catch { /* storage may be unavailable */ } }
const date = value => value ? new Date(typeof value === 'string' && !/[TZ]/.test(value) ? `${value.replace(' ','T')}Z` : value).toLocaleString('zh-CN', {hour12:false}) : '—';
const params = obj => new URLSearchParams(Object.entries(obj).filter(([,v]) => v !== '' && v != null)).toString();
function message(e) { ElMessage.error(e?.message || '操作失败，请重试'); }
function send(method, body) { return { method, body: JSON.stringify(body) }; }
async function loadList() {
  const req = ++listRequest; busy.value = true; error.value = '';
  const path = props.view === 'admins' ? '/api/admin/admins' : '/api/admin/agent/logs';
  try {
    const query = props.view === 'admins' ? { page:page.value, pageSize:pageSize.value, q:filters.q, role:filters.role, isActive:filters.isActive } : {page:page.value, pageSize:pageSize.value, q:filters.q, range:filters.range};
    const data = await props.api(`${path}?${params(query)}`); if (req !== listRequest) return;
    rows.value = data.rows || []; total.value = data.total || 0; page.value = data.page || 1;
  } catch (e) { if (req === listRequest) error.value = e.message; }
  finally { if (req === listRequest) busy.value = false; }
}
function search() { page.value = 1; loadList(); }
async function createAccount() {
  if (!account.username.trim() || !account.displayName.trim() || !account.password) return ElMessage.warning('请填写账号、姓名和密码');
  busy.value = true;
  try { await props.api('/api/admin/admins', send('POST', account)); showCreate.value = false; Object.assign(account,{username:'',displayName:'',password:'',role:'manager'}); ElMessage.success('管理员已创建'); await loadList(); }
  catch(e) { message(e); } finally { busy.value = false; }
}
async function setAccountStatus(row) {
  try {
    await ElMessageBox.confirm(`确定${row.isActive ? '停用' : '启用'}管理员 ${row.username}？`, '确认操作', {type:'warning'});
    await props.api(`/api/admin/admins/${row.id}/status`, send('PATCH',{isActive:!row.isActive})); ElMessage.success('账号状态已更新'); await loadList();
  } catch(e) { if (e !== 'cancel' && e !== 'close') message(e); }
}
async function resetAccount(row) {
  try {
    const { value } = await ElMessageBox.prompt(`请输入 ${row.username} 的新密码`, '重置密码', {inputType:'password', inputPlaceholder:'6–12 位纯数字或字母数字组合', inputValidator:v => !!v || '请输入密码'});
    await props.api(`/api/admin/admins/${row.id}/reset-password`, send('POST',{password:value})); ElMessage.success('密码已重置');
  } catch(e) { if (e !== 'cancel' && e !== 'close') message(e); }
}
async function loadSettings() {
  busy.value = true; error.value = '';
  try { const data = await props.api('/api/admin/ai-settings'); Object.assign(settings, data, {apiKey:''}); }
  catch(e) { error.value = e.message; } finally { busy.value = false; }
}
async function saveSettings() {
  savingSettings.value = true; settingsMessage.value = '';
  try { const data = await props.api('/api/admin/ai-settings', send('PATCH', {provider:settings.provider,model:settings.model,baseUrl:settings.baseUrl,apiKey:settings.apiKey,rolePrompt:settings.rolePrompt,enabled:settings.enabled})); Object.assign(settings,data,{apiKey:''}); settingsMessage.value = 'AI 服务设置已保存。'; ElMessage.success(settingsMessage.value); }
  catch(e) { settingsMessage.value = e.message; } finally { savingSettings.value = false; }
}
async function testSettings() {
  testingSettings.value = true; settingsMessage.value = '正在测试连接…';
  try { const data = await props.api('/api/admin/ai-settings/test',send('POST',{provider:settings.provider,model:settings.model,baseUrl:settings.baseUrl,apiKey:settings.apiKey})); settingsMessage.value = `连接成功：${data.message || '模型已响应'}`; }
  catch(e) { settingsMessage.value = e.message; } finally { testingSettings.value = false; }
}
async function loadConversations() { const data = await props.api('/api/admin/agent/conversations'); conversations.value = data.rows || []; }
async function openConversation(id) {
  if (sending.value) return;
  try { const data = await props.api(`/api/admin/agent/conversations/${id}`); conversationId.value = id; rememberConversation(id); messages.value = (data.messages || []).map(m => ({...m, downloads:(m.results || []).filter(r => r.downloadUrl).map(r=>({url:r.downloadUrl,label:r.label || '导出数据'}))})); }
  catch(e) { message(e); }
}
function newConversation() { if (sending.value) return; conversationId.value = null; rememberConversation(null); messages.value = []; progress.value = ''; }
async function deleteConversation(id) {
  if (sending.value) return;
  try { await ElMessageBox.confirm('删除后该对话及其审计记录将一并删除，确定继续？','删除对话',{type:'warning'}); await props.api(`/api/admin/agent/conversations/${id}`,{method:'DELETE'}); if (conversationId.value === id) newConversation(); await loadConversations(); }
  catch(e) { if (e !== 'cancel' && e !== 'close') message(e); }
}
async function ask(text = input.value) {
  text = String(text || '').trim(); if (!text || sending.value) return;
  input.value = ''; messages.value.push({role:'user',content:text});
  messages.value.push({role:'assistant',content:'',downloads:[]}); const target = messages.value[messages.value.length-1];
  sending.value = true; progress.value = '正在理解你的问题…'; controller = new AbortController();
  try {
    const response = await fetch('/api/admin/agent/chat?stream=1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,conversationId:conversationId.value || undefined}),signal:controller.signal});
    if (!response.ok || !response.body) throw new Error(response.status === 401 ? '登录已失效，请重新登录' : `请求失败 (${response.status})`);
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', done = null;
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      buffer += decoder.decode(chunk.value,{stream:true}).replace(/\r\n/g,'\n'); let index;
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0,index); buffer = buffer.slice(index+2);
        const event = (block.match(/^event:\s*(.+)$/m)||[])[1] || 'message'; const raw = (block.match(/^data:\s*(.+)$/m)||[])[1] || '{}'; let payload; try { payload = JSON.parse(raw); } catch { continue; }
        if (event === 'delta') { target.content += payload.text || ''; progress.value = '正在生成…'; }
        else if (event === 'progress') progress.value = payload.text || '处理中…';
        else if (event === 'done') done = payload;
        else if (event === 'error') throw new Error(payload.message || '生成失败');
      }
    }
    if (!done) throw new Error('连接中断，结果未确认，请重试');
    target.content = done.reply || target.content || '这次没有查到数据。'; target.downloads = done.downloads || [];
    conversationId.value = done.conversationId || conversationId.value; rememberConversation(conversationId.value); progress.value = done.source === 'llm' ? '已由 AI 分析' : '已使用内置查询模式'; await loadConversations();
  } catch(e) { target.content = `查询失败：${e.message}`; progress.value = ''; }
  finally { sending.value = false; controller = null; }
}
function parseCsv(text) {
  const result=[]; let row=[], cell='', quoted=false; text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){ const c=text[i]; if(quoted && c==='"' && text[i+1]==='"'){cell+='"';i++;} else if(c==='"') quoted=!quoted; else if(!quoted&&c===','){row.push(cell);cell='';} else if(!quoted&&(c==='\r'||c==='\n')){if(c==='\r'&&text[i+1]==='\n')i++; row.push(cell);result.push(row);row=[];cell='';} else cell+=c; }
  if(cell||row.length){row.push(cell);result.push(row);} return result;
}
async function openPreview(item) {
  try { const url = new URL(item.url, location.origin); if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) throw new Error('导出地址无效'); preview.value={...item,url:url.pathname+url.search}; }
  catch(e) { message(e); return; }
  previewRows.value=[]; previewError.value=''; previewLoading.value=true;
  try { const response = await fetch(preview.value.url,{signal:AbortSignal.timeout(15000)}); if(!response.ok) throw new Error(response.status===404?'文件已过期，请重新导出':`加载失败 (${response.status})`); previewRows.value=parseCsv(await response.text()); }
  catch(e) { previewError.value=e.message; } finally { previewLoading.value=false; }
}
watch(() => props.view, async view => {
  listRequest++; rows.value=[]; total.value=0; page.value=1; error.value=''; Object.assign(filters,{q:'',role:'',isActive:'',range:''});
  if (view === 'admins') { if (props.admin.role === 'superadmin') await loadList(); }
  else if (view === 'agent-logs') await loadList();
  else if (view === 'ai-settings') await loadSettings();
  else if (view === 'agent') { try { await loadConversations(); let saved = null; try { saved = Number(localStorage.getItem(conversationStorageKey)) || null; } catch { /* optional */ } if (saved && conversations.value.some(row => row.id === saved)) await openConversation(saved); } catch(e) { error.value=e.message; } }
},{immediate:true});
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <section class="system-view">
    <template v-if="view==='admins'">
      <header class="system-head"><div><h1>后台账号</h1><p>管理教师账号及访问权限。</p></div><el-button v-if="admin.role==='superadmin'" type="primary" @click="showCreate=true">创建管理员</el-button></header>
      <el-alert v-if="admin.role!=='superadmin'" title="只有超级管理员可以管理后台账号。" type="warning" :closable="false" />
      <div v-else class="system-panel"><form class="system-filters" @submit.prevent="search"><el-input v-model="filters.q" clearable placeholder="搜索账号或姓名" aria-label="搜索账号"/><el-select v-model="filters.role" placeholder="全部角色" clearable @change="search"><el-option label="超级管理员" value="superadmin"/><el-option label="普通管理员" value="manager"/></el-select><el-select v-model="filters.isActive" placeholder="全部状态" clearable @change="search"><el-option label="启用" value="1"/><el-option label="停用" value="0"/></el-select><el-button type="primary" native-type="submit">查询</el-button></form>
      <el-alert v-if="error" :title="error" type="error" :closable="false"/><el-table v-loading="busy" :data="rows" height="100%" empty-text="暂无管理员"><el-table-column prop="username" label="账号" min-width="120"/><el-table-column prop="displayName" label="姓名" min-width="120"/><el-table-column label="角色" min-width="120"><template #default="s">{{ s.row.role==='superadmin'?'超级管理员':'普通管理员' }}</template></el-table-column><el-table-column label="状态" width="90"><template #default="s"><el-tag :type="s.row.isActive?'success':'info'">{{ s.row.isActive?'启用':'停用' }}</el-tag></template></el-table-column><el-table-column label="最后登录" min-width="160"><template #default="s">{{ date(s.row.lastLoginAt) }}</template></el-table-column><el-table-column label="创建时间" min-width="160"><template #default="s">{{ date(s.row.createdAt) }}</template></el-table-column><el-table-column label="操作" width="145" fixed="right"><template #default="s"><template v-if="s.row.id!==admin.id"><el-button link type="primary" @click="setAccountStatus(s.row)">{{ s.row.isActive?'停用':'启用' }}</el-button><el-button link type="primary" @click="resetAccount(s.row)">重置密码</el-button></template></template></el-table-column></el-table><div class="system-pager"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="total" layout="sizes, prev, pager, next" @size-change="page=1; loadList()" @current-change="loadList"/></div></div>
      <el-dialog v-model="showCreate" title="创建管理员" width="min(500px, 94vw)"><el-form label-position="top" @submit.prevent="createAccount"><el-form-item label="账号"><el-input v-model.trim="account.username" maxlength="24"/></el-form-item><el-form-item label="姓名"><el-input v-model.trim="account.displayName" maxlength="20"/></el-form-item><el-form-item label="初始密码"><el-input v-model="account.password" type="password" show-password maxlength="12"/></el-form-item><el-form-item label="角色"><el-select v-model="account.role"><el-option label="普通管理员" value="manager"/><el-option label="超级管理员" value="superadmin"/></el-select></el-form-item><el-button type="primary" native-type="submit" :loading="busy">创建</el-button></el-form></el-dialog>
    </template>
    <template v-else-if="view==='ai-settings'"><header class="system-head"><div><h1>AI 服务设置</h1><p>配置电商客服挑战使用的模型；密钥只保存在服务端。</p></div><el-tag>{{ settings.apiKeyConfigured ? (settings.enabled?'已启用':'已配置，未启用'):'未配置' }}</el-tag></header><div class="system-panel system-settings" v-loading="busy"><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-form label-position="top" @submit.prevent="saveSettings"><el-form-item label="服务商"><el-input v-model="settings.provider" maxlength="80"/></el-form-item><el-form-item label="模型名称"><el-input v-model="settings.model" maxlength="120"/></el-form-item><el-form-item label="Base URL"><el-input v-model="settings.baseUrl" maxlength="500"/><small>填写兼容 OpenAI Chat Completions 的基础地址。</small></el-form-item><el-form-item label="API Key"><el-input v-model="settings.apiKey" type="password" show-password autocomplete="new-password" maxlength="300" placeholder="留空保持原密钥"/><small>页面不会回显已保存的密钥。</small></el-form-item><el-form-item label="消费者角色提示词"><el-input v-model="settings.rolePrompt" type="textarea" :rows="5" maxlength="2000"/></el-form-item><el-form-item label="启用 AI 客服挑战"><el-switch v-model="settings.enabled"/><small>关闭时保留内置训练场景。</small></el-form-item><p v-if="settingsMessage" role="status">{{settingsMessage}}</p><el-button @click="testSettings" :loading="testingSettings">测试连接</el-button><el-button type="primary" native-type="submit" :loading="savingSettings">保存设置</el-button></el-form></div></template>
    <template v-else-if="view==='agent-logs'"><header class="system-head"><div><h1>助手审计</h1><p>查看提问、工具调用与回复摘要。</p></div><el-button @click="loadList" :loading="busy">刷新</el-button></header><div class="system-panel"><form class="system-filters" @submit.prevent="search"><el-input v-model="filters.q" clearable placeholder="搜索提问或管理员"/><el-select v-model="filters.range" placeholder="全部时间" clearable @change="search"><el-option label="今天" value="today"/><el-option label="最近 7 天" value="7d"/><el-option label="最近 30 天" value="30d"/></el-select><el-button type="primary" native-type="submit">查询</el-button></form><el-alert v-if="error" :title="error" type="error" :closable="false"/><el-table v-loading="busy" :data="rows" height="100%" empty-text="暂无审计记录"><el-table-column prop="message" label="提问" min-width="220" show-overflow-tooltip/><el-table-column prop="adminUsername" label="管理员" width="120"/><el-table-column label="工具" min-width="150"><template #default="s">{{ (s.row.tools||[]).join('、') || '未调用' }}</template></el-table-column><el-table-column label="来源" width="95"><template #default="s">{{s.row.source==='llm'?'AI 分析':'内置规则'}}</template></el-table-column><el-table-column label="时间" min-width="160"><template #default="s">{{date(s.row.createdAt)}}</template></el-table-column><el-table-column prop="reply" label="回复摘要" min-width="220" show-overflow-tooltip/></el-table><div class="system-pager"><span>共 {{total}} 条</span><el-pagination v-model:current-page="page" v-model:page-size="pageSize" :page-sizes="[10,20,50]" :total="total" layout="sizes, prev, pager, next" @size-change="page=1; loadList()" @current-change="loadList"/></div></div></template>
    <template v-else-if="view==='agent'"><header class="system-head"><div><h1>管理助手</h1><p>查询课堂数据与导出成绩；助手不能修改数据。</p></div><el-button type="primary" @click="newConversation" :disabled="sending">新对话</el-button></header><el-alert v-if="error" :title="error" type="error" :closable="false"/><div class="system-agent"><aside class="system-history"><strong>历史对话</strong><p v-if="!conversations.length">暂无历史对话</p><div v-for="c in conversations" :key="c.id" class="history-row"><button type="button" @click="openConversation(c.id)" :disabled="sending"><strong>{{c.title || '新对话'}}</strong><small>{{c.messageCount}} 条 · {{date(c.updatedAt)}}</small></button><el-button link type="danger" :disabled="sending" @click="deleteConversation(c.id)">删除</el-button></div></aside><section class="system-chat"><div class="system-messages" aria-live="polite"><p v-if="!messages.length" class="chat-placeholder">你好，可以问我“谁最近没练习”或“导出竞速成绩”。</p><article v-for="(m,i) in messages" :key="i" :class="['system-message',m.role]"><strong>{{m.role==='user'?'我':'管理助手'}}</strong><p>{{m.content || (sending && i===messages.length-1 ? progress : '')}}</p><el-button v-for="(d,j) in m.downloads || []" :key="j" size="small" @click="openPreview(d)">预览{{d.label || '数据'}} CSV</el-button></article></div><div class="system-quick"><el-button size="small" @click="ask('本周比上周怎么样')" :disabled="sending">本周 vs 上周</el-button><el-button size="small" @click="ask('谁最近没练习')" :disabled="sending">谁没练习</el-button><el-button size="small" @click="ask('哪些键最容易打错')" :disabled="sending">易错键</el-button><el-button size="small" @click="ask('各班对比')" :disabled="sending">各班对比</el-button></div><form @submit.prevent="ask()"><el-input v-model="input" type="textarea" :rows="3" maxlength="2000" :disabled="sending" placeholder="输入您的问题" @keydown.ctrl.enter.prevent="ask()"/><div class="system-send"><span role="status">{{progress}}</span><el-button type="primary" native-type="submit" :loading="sending">发送</el-button></div></form></section></div>
      <el-dialog :model-value="!!preview" @update:model-value="v => { if (!v) preview=null }" :title="`${preview?.label || '数据'} · CSV 预览`" width="min(900px, 94vw)"><div v-loading="previewLoading"><el-alert v-if="previewError" :title="previewError" type="error" :closable="false"/><div v-else class="csv-scroll"><table v-if="previewRows.length"><thead><tr><th v-for="(v,i) in previewRows[0]" :key="i">{{v}}</th></tr></thead><tbody><tr v-for="(row,i) in previewRows.slice(1)" :key="i"><td v-for="(v,j) in row" :key="j">{{v}}</td></tr></tbody></table></div><p v-if="!previewError && !previewLoading">共 {{Math.max(0,previewRows.length-1)}} 行</p></div><template #footer><el-button @click="preview=null">关闭</el-button><a v-if="preview && !previewError && !previewLoading" :href="preview.url" download><el-button type="primary">下载 CSV</el-button></a></template></el-dialog>
    </template>
  </section>
</template>

<style scoped>
.system-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.system-head h1{margin:0 0 8px;font-size:28px}.system-head p{margin:0;color:#75867d;font-size:14px}.system-panel{background:#fff;border:1px solid #e5ece7;border-radius:12px;padding:24px}.system-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.system-filters .el-input{width:260px}.system-filters .el-select{width:150px}.system-pager{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:20px;color:#7a8c81}.system-settings{max-width:800px}.system-settings small{display:block;color:#85958c;line-height:1.6}.system-agent{display:grid;grid-template-columns:230px minmax(0,1fr);background:white;border:1px solid #e5ece7;border-radius:12px;min-height:600px;overflow:hidden}.system-history{padding:20px;border-right:1px solid #e5ece7}.system-history>p{color:#8b9a90}.history-row{display:flex;align-items:center;gap:3px;border-bottom:1px solid #edf1ee}.history-row>button:first-child{flex:1;min-width:0;text-align:left;border:0;background:none;cursor:pointer;padding:12px 0;color:#294238}.history-row strong,.history-row small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.history-row small{color:#8b9a90;margin-top:5px}.system-chat{display:flex;flex-direction:column;min-width:0;padding:20px}.system-messages{flex:1;max-height:500px;overflow:auto}.chat-placeholder{color:#84968a}.system-message{padding:14px 16px;background:#f3f7f4;border-radius:10px;margin-bottom:12px;max-width:90%}.system-message.user{margin-left:auto;background:#e4f3ea}.system-message p{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:8px 0}.system-quick{display:flex;gap:5px;flex-wrap:wrap;margin:14px 0}.system-quick .el-button{margin-left:0}.system-send{display:flex;justify-content:space-between;align-items:center;margin-top:10px;color:#76887c;font-size:13px}.csv-scroll{overflow:auto;max-height:55vh}.csv-scroll table{border-collapse:collapse;width:100%}.csv-scroll th,.csv-scroll td{border:1px solid #e3eae5;padding:8px;text-align:left;white-space:nowrap}@media(max-width:760px){.system-agent{grid-template-columns:1fr}.system-history{border-right:0;border-bottom:1px solid #e5ece7;max-height:190px;overflow:auto}.system-filters .el-input,.system-filters .el-select{width:100%}.system-head{align-items:flex-start}.system-panel{padding:16px}.system-pager{flex-wrap:wrap}}
</style>
