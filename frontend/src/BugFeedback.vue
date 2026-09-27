<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ArrowLeft, Bug, Check, ChevronRight, CircleAlert, FileImage, LoaderCircle, RotateCw, Send, Trash2 } from 'lucide-vue-next';

const props = defineProps({ user: { type: Object, default: null } });
const emit = defineEmits(['back', 'login']);
const form = reactive({ title: '', preconditions: '', steps: '', testData: '', expectedResult: '', actualResult: '', priority: 'P2', frequency: '每次', environment: '' });
const attachmentData = ref('');
const attachmentName = ref('');
const reports = ref([]);
const busy = ref(false);
const loadingReports = ref(false);
const error = ref('');
const submitted = ref(null);
const fileInput = ref(null);

async function requestJSON(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '请求失败，请稍后重试');
  return data;
}

async function loadReports() {
  if (!props.user) return;
  loadingReports.value = true;
  try { reports.value = (await requestJSON('/api/bug-reports/mine')).reports || []; }
  catch { /* 反馈列表加载失败不应阻止填写 */ }
  finally { loadingReports.value = false; }
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('无法识别这张图片'));
      image.onload = () => {
        const scale = Math.min(1, 1280 / image.width, 1280 / image.height);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        let quality = 0.78;
        let data = canvas.toDataURL('image/jpeg', quality);
        while (data.length > 180_000 && quality > 0.4) {
          quality -= 0.08;
          data = canvas.toDataURL('image/jpeg', quality);
        }
        if (data.length > 220_000) reject(new Error('截图无法压缩到上传大小，请裁剪后再试'));
        else resolve(data);
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function chooseAttachment(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  error.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { error.value = '附件请选择图片格式'; return; }
  if (file.size > 5 * 1024 * 1024) { error.value = '原始截图不能超过 5MB'; return; }
  try { attachmentData.value = await readImage(file); attachmentName.value = file.name; }
  catch (cause) { error.value = cause.message; }
}

function clearAttachment() { attachmentData.value = ''; attachmentName.value = ''; }

async function submitReport() {
  if (!props.user) { emit('login'); return; }
  busy.value = true;
  error.value = '';
  try {
    const result = await requestJSON('/api/bug-reports', {
      method: 'POST',
      body: JSON.stringify({ ...form, environment: form.environment || `${navigator.userAgent}\n页面：${location.href}`, attachmentData: attachmentData.value })
    });
    submitted.value = result.caseId;
    Object.assign(form, { title: '', preconditions: '', steps: '', testData: '', expectedResult: '', actualResult: '', priority: 'P2', frequency: '每次', environment: '' });
    clearAttachment();
    await loadReports();
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = false; }
}

onMounted(loadReports);
</script>

<template>
  <main class="bug-page">
    <header class="bug-topbar">
      <button class="bug-back" type="button" @click="emit('back')"><ArrowLeft :size="17"/>返回游戏大厅</button>
      <div class="bug-brand"><span><Bug :size="20"/></span><div><b>问题反馈</b><small>BUG REPORT</small></div></div>
      <div class="bug-user"><i></i>{{ user?.displayName || '学生反馈入口' }}</div>
    </header>

    <section class="bug-layout">
      <div class="bug-intro">
        <div class="bug-kicker"><CircleAlert :size="15"/>帮助我们把游戏做得更好</div>
        <h1>发现问题？<br/><em>告诉我们怎么复现。</em></h1>
        <p>按测试用例的方式描述问题，步骤越清楚，越容易定位和修复。</p>
        <div class="bug-process"><span>01 <b>填写场景</b></span><ChevronRight :size="15"/><span>02 <b>描述结果</b></span><ChevronRight :size="15"/><span>03 <b>提交跟进</b></span></div>
        <div class="bug-note"><FileImage :size="17"/><span>可以附一张截图；提交后会生成反馈编号，方便后续查询。</span></div>
      </div>

      <section class="bug-form-card">
        <header class="form-heading"><div><small>测试用例 · 缺陷记录</small><h2>提交 Bug 反馈</h2></div><span class="required-note"><b>*</b> 必填项</span></header>
        <div v-if="submitted" class="submit-success" role="status"><span><Check :size="18"/></span><div><b>反馈已提交</b><small>编号 {{ submitted }} · 老师可在管理端查看</small></div><button type="button" @click="submitted = null">继续反馈</button></div>
        <div v-if="!user" class="login-gate"><div class="gate-icon"><Bug :size="21"/></div><h3>登录学生账号后提交</h3><p>反馈会关联你的学生账号，便于老师需要时向你确认复现情况。</p><button type="button" @click="emit('login')">登录 / 注册 <ChevronRight :size="16"/></button></div>
        <form v-else class="bug-form" @submit.prevent="submitReport">
          <label class="field full"><span>缺陷标题 <b>*</b></span><input v-model.trim="form.title" maxlength="120" required placeholder="简要描述问题，例如：简单模式音符下落速度过快"/></label>
          <label class="field full"><span>前置条件</span><textarea v-model.trim="form.preconditions" rows="2" maxlength="1200" placeholder="例如：进入游戏大厅，选择音游模式和简单难度"></textarea></label>
          <label class="field full"><span>复现步骤 <b>*</b></span><textarea v-model.trim="form.steps" rows="3" maxlength="4000" required placeholder="1. 打开……&#10;2. 点击……&#10;3. 观察到……"></textarea></label>
          <label class="field"><span>测试数据</span><input v-model.trim="form.testData" maxlength="1200" placeholder="输入的文字、选择的模式等"/></label>
          <label class="field"><span>复现频率</span><select v-model="form.frequency"><option>每次</option><option>经常</option><option>偶尔</option><option>仅一次</option></select></label>
          <label class="field full"><span>预期结果 <b>*</b></span><textarea v-model.trim="form.expectedResult" rows="2" maxlength="1600" required placeholder="你认为正确的表现应该是什么？"></textarea></label>
          <label class="field full"><span>实际结果 <b>*</b></span><textarea v-model.trim="form.actualResult" rows="2" maxlength="1600" required placeholder="实际发生了什么？是否出现报错或画面异常？"></textarea></label>
          <div class="field"><span>优先级 / 严重程度</span><div class="priority-options"><label v-for="item in [{key:'P0',name:'阻断'}, {key:'P1',name:'严重'}, {key:'P2',name:'一般'}, {key:'P3',name:'轻微'}]" :key="item.key" :class="['priority-chip', `priority-${item.key.toLowerCase()}`, {selected:form.priority===item.key}]"><input v-model="form.priority" type="radio" :value="item.key"/><b>{{ item.key }}</b>{{ item.name }}</label></div></div>
          <div class="field"><span>截图附件 <small>可选 · 图片 ≤ 5MB</small></span><div v-if="!attachmentData" class="upload-box" @click="fileInput?.click()"><FileImage :size="18"/><span>点击上传截图</span><small>自动压缩后安全上传</small><input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" @change="chooseAttachment"/></div><div v-else class="attachment-preview"><img :src="attachmentData" alt="待上传的截图预览"/><span :title="attachmentName">{{ attachmentName }}</span><button type="button" aria-label="移除截图" @click="clearAttachment"><Trash2 :size="15"/></button></div></div>
          <details class="environment-field full"><summary>环境信息（自动采集，可补充）</summary><textarea v-model.trim="form.environment" rows="2" maxlength="500" placeholder="浏览器和当前页面信息会自动附上"></textarea></details>
          <p v-if="error" class="form-error" role="alert"><CircleAlert :size="15"/>{{ error }}</p>
          <footer class="form-footer"><span>反馈内容仅供课程管理和问题排查使用。</span><button type="submit" :disabled="busy"><LoaderCircle v-if="busy" class="spin" :size="16"/><Send v-else :size="16"/>{{ busy ? '提交中…' : '提交反馈' }}</button></footer>
        </form>
      </section>

      <section v-if="user" class="report-history"><header><div><small>MY REPORTS</small><h2>我的最近反馈</h2></div><button type="button" :disabled="loadingReports" @click="loadReports"><RotateCw :size="15"/>刷新</button></header><div v-if="reports.length" class="report-list"><article v-for="report in reports" :key="report.id"><span class="report-status">{{ report.status }}</span><b>{{ report.title }}</b><small>BUG-{{ String(report.id).padStart(5, '0') }} · {{ new Date(report.createdAt).toLocaleString('zh-CN') }}</small></article></div><p v-else class="report-empty">{{ loadingReports ? '正在读取反馈记录…' : '提交后的反馈编号和处理状态会显示在这里。' }}</p></section>
    </section>
  </main>
</template>

<style scoped>
.bug-page{min-height:100vh;background:radial-gradient(ellipse at 10% 8%,#e7f2ff 0,transparent 34%),#f4f8fd;color:#1c3554;font-family:Inter,"Microsoft YaHei",sans-serif}.bug-topbar{height:70px;padding:0 clamp(20px,5vw,76px);display:flex;align-items:center;gap:28px;border-bottom:1px solid #dbe7f4;background:#ffffffd9}.bug-back,.bug-user{display:flex;align-items:center;gap:8px;color:#56718d;font-size:13px}.bug-back{border:0;background:none;cursor:pointer}.bug-brand{display:flex;align-items:center;gap:10px;margin-right:auto}.bug-brand>span{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#e8f2ff;color:#347fe1}.bug-brand b,.bug-brand small{display:block}.bug-brand b{font-size:15px}.bug-brand small{margin-top:2px;color:#8ca0b5;font:700 8px Inter,sans-serif;letter-spacing:2px}.bug-user i{width:7px;height:7px;border-radius:50%;background:#28bd9b}.bug-layout{width:min(1050px,calc(100% - 40px));margin:40px auto 72px;display:grid;grid-template-columns:minmax(220px,.7fr) minmax(0,1.3fr);gap:24px;align-items:start}.bug-intro{position:sticky;top:28px;padding:12px 8px}.bug-kicker{display:inline-flex;align-items:center;gap:7px;color:#4380cb;font-size:12px;font-weight:700}.bug-intro h1{margin:22px 0 14px;font-size:clamp(30px,4vw,43px);line-height:1.28;letter-spacing:-1.5px}.bug-intro h1 em{font-style:normal;color:#347fe1}.bug-intro>p{max-width:340px;color:#70869e;font-size:14px;line-height:1.9}.bug-process{display:flex;align-items:center;gap:5px;margin-top:32px;color:#a1b3c6;font-size:10px}.bug-process span{padding:9px 8px;border:1px solid #dce8f6;border-radius:9px;background:#ffffffb8;color:#5890d3}.bug-process b{margin-left:4px;color:#526b85;font-size:11px}.bug-note{display:flex;gap:10px;align-items:flex-start;margin-top:24px;padding:13px;border-radius:12px;background:#eaf3fd;color:#64819e;font-size:12px;line-height:1.7}.bug-note :deep(svg){flex:none;color:#4e91e4}.bug-form-card,.report-history{padding:25px 28px;border:1px solid #e1eaf4;border-radius:18px;background:#fff;box-shadow:0 12px 34px #244a7410}.form-heading,.report-history>header{display:flex;align-items:center;justify-content:space-between;padding-bottom:18px;border-bottom:1px solid #edf2f7}.form-heading small,.report-history header small{color:#8aa0b7;font-size:10px;font-weight:700;letter-spacing:1.2px}.form-heading h2,.report-history h2{margin:5px 0 0;font-size:20px}.required-note{color:#8b9bb0;font-size:11px}.required-note b,.field>span b{color:#e96e65}.bug-form{display:grid;grid-template-columns:1fr 1fr;gap:15px 16px;padding-top:18px}.field{display:flex;min-width:0;flex-direction:column;gap:7px}.field.full,.environment-field.full{grid-column:1/-1}.field>span{color:#536a83;font-size:12px;font-weight:700}.field>span small{margin-left:5px;color:#a0aec0;font-size:10px;font-weight:400}.field input:not([type=radio]),.field textarea,.field select,.environment-field textarea{width:100%;box-sizing:border-box;border:1px solid #dce6f0;border-radius:9px;outline:none;background:#fbfdff;padding:10px 12px;color:#263e58;font:12px/1.6 inherit;transition:border .18s,box-shadow .18s}.field textarea,.environment-field textarea{resize:vertical;min-height:56px}.field input:focus,.field textarea:focus,.field select:focus,.environment-field textarea:focus{border-color:#76a9ef;box-shadow:0 0 0 3px #4b91e91a}.field input::placeholder,.field textarea::placeholder{color:#aab8c8}.priority-options{display:flex;flex-wrap:wrap;gap:5px}.priority-chip{display:flex;align-items:center;gap:4px;padding:7px 8px;border:1px solid #e2eaf2;border-radius:8px;background:#fbfdff;color:#8091a4;font-size:10px;cursor:pointer}.priority-chip input{position:absolute;opacity:0;pointer-events:none}.priority-chip b{font-size:10px}.priority-chip.selected{border-color:#8cb7ed;background:#eff6ff;color:#347bd0}.priority-p0.selected,.priority-p1.selected{border-color:#f0b5ae;background:#fff5f3;color:#ce6257}.upload-box{display:grid;grid-template-columns:24px 1fr;align-items:center;column-gap:4px;padding:8px 10px;border:1px dashed #bdcfe1;border-radius:9px;color:#518bd0;cursor:pointer}.upload-box>svg{grid-row:span 2}.upload-box span{font-size:11px;font-weight:700}.upload-box small{color:#9aabbd;font-size:9px}.upload-box input{display:none}.attachment-preview{display:flex;align-items:center;gap:8px;min-width:0;padding:5px;border:1px solid #dce8f4;border-radius:9px}.attachment-preview img{width:38px;height:34px;border-radius:5px;object-fit:cover}.attachment-preview span{overflow:hidden;flex:1;color:#627a94;font-size:10px;text-overflow:ellipsis;white-space:nowrap}.attachment-preview button{display:grid;place-items:center;width:27px;height:27px;border:0;border-radius:6px;background:#fff0ef;color:#d96b64;cursor:pointer}.environment-field{padding-top:1px;color:#7288a0;font-size:11px}.environment-field summary{cursor:pointer}.environment-field textarea{margin-top:9px}.form-error{grid-column:1/-1;display:flex;align-items:center;gap:7px;margin:0;color:#d65f56;font-size:12px}.form-footer{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:5px}.form-footer>span{color:#99a9ba;font-size:10px}.form-footer button,.login-gate button{display:flex;align-items:center;justify-content:center;gap:8px;min-width:132px;padding:11px 18px;border:0;border-radius:9px;background:linear-gradient(120deg,#4a9af0,#3472d4);box-shadow:0 7px 16px #3d80d638;color:#fff;font-size:12px;font-weight:700;cursor:pointer}.form-footer button:disabled{opacity:.65;cursor:wait}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.submit-success{display:flex;align-items:center;gap:10px;margin:15px 0 0;padding:11px 12px;border:1px solid #cbeee2;border-radius:11px;background:#f1fbf7}.submit-success>span{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#d8f5e9;color:#169c76}.submit-success div{display:flex;flex:1;flex-direction:column;gap:3px}.submit-success b{font-size:12px}.submit-success small{color:#658d80;font-size:10px}.submit-success button{border:0;background:none;color:#397fc9;font-size:10px;cursor:pointer}.login-gate{padding:44px 14px 30px;text-align:center}.gate-icon{display:grid;place-items:center;width:48px;height:48px;margin:0 auto 14px;border-radius:15px;background:#edf5ff;color:#4388da}.login-gate h3{margin:0;font-size:16px}.login-gate p{max-width:330px;margin:8px auto 18px;color:#8193a6;font-size:12px;line-height:1.7}.login-gate button{margin:auto}.report-history{grid-column:2;padding:20px 24px}.report-history>header{padding-bottom:13px}.report-history h2{font-size:16px}.report-history header button{display:flex;align-items:center;gap:5px;border:0;background:none;color:#5a85b3;font-size:11px;cursor:pointer}.report-list{display:grid}.report-list article{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;padding:12px 0;border-bottom:1px solid #edf2f7}.report-list article:last-child{border-bottom:0}.report-status{align-self:center;padding:4px 7px;border-radius:20px;background:#fff6e6;color:#bc8b2c;font-size:9px}.report-list b{overflow:hidden;color:#405a75;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.report-list small{grid-column:2;color:#98a8b8;font-size:9px}.report-empty{padding:10px 0;color:#94a4b5;font-size:11px}@media(max-width:760px){.bug-topbar{height:60px;gap:12px;padding:0 16px}.bug-brand{margin-right:auto}.bug-user{display:none}.bug-layout{grid-template-columns:1fr;width:min(600px,calc(100% - 24px));margin:20px auto 40px;gap:15px}.bug-intro{position:static;padding:8px 4px}.bug-intro h1{margin:12px 0 6px;font-size:30px}.bug-intro>p{margin:0;font-size:12px}.bug-process{margin-top:12px}.bug-note{display:none}.bug-form-card{padding:19px 16px}.report-history{grid-column:1;padding:17px 16px}.bug-form{gap:13px}.form-footer{align-items:flex-end}.form-footer>span{max-width:190px;line-height:1.6}}@media(max-width:420px){.bug-back{font-size:0;gap:0}.bug-back svg{width:20px;height:20px}.bug-form{grid-template-columns:1fr}.field.full,.environment-field.full{grid-column:1}.bug-form-card{padding:16px 13px}.form-footer{flex-direction:column;align-items:stretch}.form-footer button{align-self:flex-end}}
</style>
