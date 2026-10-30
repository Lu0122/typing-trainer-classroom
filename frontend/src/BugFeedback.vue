<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { Bug, Check, ChevronDown, CircleAlert, FileImage, ImagePlus, LoaderCircle, RotateCw, Send, Trash2 } from 'lucide-vue-next';
import AppHeader from './AppHeader.vue';

const props = defineProps({
  user: { type: Object, default: null },
  // 从哪个页面点进来的（App.vue 在切页时记下），用来预选「哪个功能」。
  from: { type: String, default: '' }
});
const emit = defineEmits(['back', 'login']);

// 功能列表：跟页面 key 对应，方便从游戏里点「反馈」时自动选中。
const FEATURES = [
  { name: '打字练习', pages: ['practice', 'beginner', 'english-home', 'english-word', 'english-phrase', 'english-article', 'pinyin-home', 'pinyin-syllable', 'pinyin-word', 'pinyin-article', 'diagnostics', 'diagnostic-drill'] },
  { name: '挑战模式', pages: ['challenge-home', 'challenge-english', 'challenge-pinyin'] },
  { name: '音游节奏', pages: ['rhythm'] },
  { name: '打字赛车', pages: ['race'] },
  { name: '占领战', pages: ['battle'] },
  { name: '打 Boss', pages: ['boss'] },
  { name: '遗迹逃亡', pages: ['runner'] },
  { name: '追逐战', pages: ['chase'] },
  { name: '比赛赛事', pages: ['competition', 'competition-hub', 'battle-competition'] },
  { name: '排行榜 / 成绩', pages: ['leaderboard', 'growth'] },
  { name: '登录 / 账号', pages: ['account'] },
  { name: '其他', pages: [] }
];

// 点一下就能表达，不用打字。
const ISSUES = ['卡住不动', '画面错乱', '分数不对', '打不了字', '进不去', '声音异常', '其他'];

const SEVERITIES = [
  { key: 'P3', name: '还能玩', hint: '只是有点怪' },
  { key: 'P1', name: '玩不下去', hint: '卡住了' },
  { key: 'P0', name: '完全进不去', hint: '打不开' }
];

const DRAFT_KEY = 'bug-feedback-draft';
const form = reactive({ title: '', feature: '', issues: [], severity: 'P3', steps: '', expectedResult: '' });
const attachmentData = ref('');
const attachmentName = ref('');
const reports = ref([]);
const busy = ref(false);
const loadingReports = ref(false);
const error = ref('');
const submitted = ref('');
const showHistory = ref(false);
const fileInput = ref(null);
const dragging = ref(false);

const canSubmit = computed(() => Boolean(form.title.trim()) && !busy.value);
const autoEnvironment = computed(() => `${navigator.userAgent}\n页面：${location.href}`);

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

async function handleFile(file) {
  error.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { error.value = '附件请选择图片格式'; return; }
  if (file.size > 5 * 1024 * 1024) { error.value = '原始截图不能超过 5MB'; return; }
  try { attachmentData.value = await readImage(file); attachmentName.value = file.name; }
  catch (cause) { error.value = cause.message; }
}

async function chooseAttachment(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  await handleFile(file);
}

function onDrop(event) {
  dragging.value = false;
  handleFile(event.dataTransfer?.files?.[0]);
}

// 直接从剪贴板粘贴截图 —— 学生刚截完图按 Ctrl+V 最快。
function onPaste(event) {
  const item = [...(event.clipboardData?.items || [])].find((entry) => entry.type.startsWith('image/'));
  if (!item) return;
  event.preventDefault();
  handleFile(item.getAsFile());
}

function toggleIssue(name) {
  const index = form.issues.indexOf(name);
  if (index >= 0) form.issues.splice(index, 1);
  else form.issues.push(name);
}

function clearAttachment() { attachmentData.value = ''; attachmentName.value = ''; }

// 草稿：机房中途切页面/刷新不至于白填。
watch(form, (value) => {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...value, issues: [...value.issues] })); } catch { /* 隐私模式 */ }
}, { deep: true });

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') {
      for (const key of ['title', 'feature', 'severity', 'steps', 'expectedResult']) {
        if (typeof saved[key] === 'string') form[key] = saved[key];
      }
      if (Array.isArray(saved.issues)) form.issues = saved.issues.filter((item) => ISSUES.includes(item));
    }
  } catch { /* 草稿损坏就忽略 */ }
}

async function submitReport() {
  if (!props.user) { emit('login'); return; }
  if (!form.title.trim()) { error.value = '请用一句话说清遇到的问题'; return; }
  busy.value = true;
  error.value = '';
  try {
    // 映射到后端的测试用例字段：学生看到的是一句话 + 标签，后台仍能看到结构化信息。
    const detail = [form.issues.length ? `问题类型：${form.issues.join('、')}` : '', form.title.trim()].filter(Boolean).join('\n');
    const result = await requestJSON('/api/bug-reports', {
      method: 'POST',
      body: JSON.stringify({
        title: form.title.trim(),
        preconditions: form.feature ? `功能：${form.feature}` : '',
        steps: form.steps.trim(),
        expectedResult: form.expectedResult.trim(),
        actualResult: detail,
        priority: form.severity,
        frequency: '每次',
        environment: autoEnvironment.value
      })
    });
    submitted.value = result.caseId;
    showHistory.value = true;  // 提交后自动展开，学生能马上看到这条的状态
    Object.assign(form, { title: '', feature: '', issues: [], severity: 'P3', steps: '', expectedResult: '' });
    clearAttachment();
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* 隐私模式 */ }
    await loadReports();
  } catch (cause) { error.value = cause.message; }
  finally { busy.value = false; }
}

function statusClass(status) {
  if (status === '已处理') return 'is-done';
  if (status === '处理中') return 'is-doing';
  return 'is-new';
}

onMounted(() => {
  // 从游戏页点「反馈」进来时，自动选好功能，学生少点一次。
  const matched = FEATURES.find((item) => item.pages.includes(props.from));
  if (matched && matched.name !== '其他') form.feature = matched.name;
  restoreDraft();
  if (props.user) loadReports();
  window.addEventListener('paste', onPaste);
});

onUnmounted(() => window.removeEventListener('paste', onPaste));
</script>

<template>
  <main class="bug-page">
    <AppHeader
      title="问题反馈"
      subtitle="BUG REPORT"
      :icon="Bug"
      back-label="返回"
      :user="props.user"
      @back="emit('back')"
      @account="emit('login')"
    />

    <section class="bug-main">
      <div v-if="submitted" class="submit-success" role="status">
        <span class="ok-icon"><Check :size="20"/></span>
        <div class="ok-text">
          <b>收到了，编号 <em>{{ submitted }}</em></b>
          <small>老师会看到这条反馈，处理进度可以往下翻</small>
        </div>
        <button type="button" @click="submitted = ''">再反馈一条</button>
      </div>

      <div v-if="!user" class="login-gate">
        <div class="gate-icon"><Bug :size="22"/></div>
        <h3>登录后就能反馈</h3>
        <p>反馈会关联你的账号，老师需要确认时能找到你。</p>
        <button type="button" @click="emit('login')">登录 / 注册</button>
      </div>

      <form v-else class="bug-card" @submit.prevent="submitReport">
        <label class="q q-main" for="bug-title">
          <span class="q-label">说清发生了什么 <b>*</b><small>一句话就行，其他都可以不填</small></span>
          <textarea
            id="bug-title"
            v-model="form.title"
            rows="2"
            maxlength="120"
            placeholder="例如：音游第三关音符突然不动了，只能刷新页面"
            @keydown.ctrl.enter="submitReport"
          ></textarea>
          <span class="q-hint">
            <span>写清楚「在哪」+「看到什么」就够了</span>
            <span :class="['counter', { warn: form.title.length > 100 }]">{{ form.title.length }}/120</span>
          </span>
        </label>

        <div class="q">
          <span class="q-label">是哪个功能？</span>
          <div class="chips chips-feature">
            <button
              v-for="item in FEATURES"
              :key="item.name"
              type="button"
              :class="['chip', { on: form.feature === item.name }]"
              @click="form.feature = form.feature === item.name ? '' : item.name"
            >{{ item.name }}</button>
          </div>
        </div>

        <div class="q">
          <span class="q-label">具体是什么情况？<small>可多选</small></span>
          <div class="chips chips-issue">
            <button
              v-for="item in ISSUES"
              :key="item"
              type="button"
              :class="['chip', { on: form.issues.includes(item) }]"
              @click="toggleIssue(item)"
            >{{ item }}</button>
          </div>
        </div>

        <div class="q">
          <span class="q-label">还能继续玩吗？</span>
          <div class="severity">
            <button
              v-for="item in SEVERITIES"
              :key="item.key"
              type="button"
              :class="['severity-chip', `sev-${item.key.toLowerCase()}`, { on: form.severity === item.key }]"
              @click="form.severity = item.key"
            >
              <b>{{ item.name }}</b>
              <small>{{ item.hint }}</small>
            </button>
          </div>
        </div>

        <div class="q">
          <span class="q-label">截个图 <small>可选 · 也能直接 Ctrl+V 粘贴</small></span>
          <div
            v-if="!attachmentData"
            :class="['dropzone', { dragging }]"
            @click="fileInput?.click()"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <ImagePlus :size="20"/>
            <span>点这里选图，或把截图拖进来</span>
            <small>自动压缩，不会上传原图</small>
            <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" @change="chooseAttachment"/>
          </div>
          <div v-else class="attachment-preview">
            <img :src="attachmentData" alt="待上传的截图预览"/>
            <span :title="attachmentName">{{ attachmentName }}</span>
            <button type="button" aria-label="移除截图" @click="clearAttachment"><Trash2 :size="15"/></button>
          </div>
        </div>

        <details class="more">
          <summary><ChevronDown :size="15"/><span>补充细节</span><small>选填，写清楚更容易一次修好</small></summary>
          <div class="more-body">
            <label class="q">
              <span class="q-label">怎么操作才能重现？</span>
              <textarea v-model="form.steps" rows="3" maxlength="4000" placeholder="1. 进入音游&#10;2. 选第三关&#10;3. 打到一半音符就停了"></textarea>
            </label>
            <label class="q">
              <span class="q-label">你希望它是什么样？</span>
              <textarea v-model="form.expectedResult" rows="2" maxlength="1600" placeholder="例如：音符应该正常往下掉，不会停住"></textarea>
            </label>
            <div class="env-note"><FileImage :size="14"/><span>浏览器和当前页面地址会自动附上，不用自己写。</span></div>
          </div>
        </details>

        <p v-if="error" class="form-error" role="alert"><CircleAlert :size="15"/>{{ error }}</p>

        <footer class="form-footer">
          <button type="submit" :disabled="!canSubmit">
            <LoaderCircle v-if="busy" class="spin" :size="17"/><Send v-else :size="17"/>
            {{ busy ? '提交中…' : '提交反馈' }}
          </button>
          <span>Ctrl + 回车 也能提交</span>
        </footer>
      </form>

      <details v-if="user && (reports.length || loadingReports)" class="history" :open="showHistory">
        <summary>
          <ChevronDown :size="15"/>
          <span>我提交过的反馈</span>
          <small>{{ reports.length }} 条</small>
          <button type="button" :disabled="loadingReports" @click.prevent.stop="loadReports">
            <RotateCw :size="13"/>刷新
          </button>
        </summary>
        <div v-if="reports.length" class="report-list">
          <article v-for="report in reports" :key="report.id">
            <span :class="['report-status', statusClass(report.status)]">{{ report.status }}</span>
            <div class="report-body">
              <b>{{ report.title }}</b>
              <small>BUG-{{ String(report.id).padStart(5, '0') }} · {{ new Date(report.createdAt).toLocaleString('zh-CN') }}</small>
            </div>
          </article>
        </div>
        <p v-else class="report-empty">{{ loadingReports ? '正在读取…' : '还没有提交过反馈。' }}</p>
      </details>
    </section>
  </main>
</template>

<style scoped>
.bug-page{min-height:100vh;background:radial-gradient(ellipse at 12% 0,#e6f1ff 0,transparent 36%),#f3f7fc;color:#1c3554;font-family:Inter,"Microsoft YaHei",sans-serif}
.bug-main{width:min(760px,calc(100% - 32px));margin:14px auto 40px;display:grid;gap:10px}
.bug-lead{display:flex;align-items:baseline;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:2px}
.bug-lead h1{margin:0;font-size:clamp(20px,2.6vw,24px);letter-spacing:-.6px}
.bug-lead p{margin:0;color:#7b8fa6;font-size:12.5px}

.bug-card,.history,.login-gate{padding:16px 22px;border:1px solid #e2ebf5;border-radius:16px;background:#fff;box-shadow:0 10px 30px #244a740d}
.bug-card{display:grid;gap:13px;min-width:0}

/* 每个问题块：标签 + 控件 + 提示，垂直排开 */
.q{display:grid;gap:7px;min-width:0}
.q > *{min-width:0}
.q-label{display:flex;align-items:center;gap:6px;color:#3d5771;font-size:13px;font-weight:700}
.q-label b{color:#e96e65}
.q-label small{color:#9fb0c2;font-size:11px;font-weight:400}
/* 全局 style.css 给 textarea 设了 margin:0 32px / width:calc(100%-64px) / min-height:90px，
   这里是卡片内的输入框，必须全部覆盖，否则右侧会被撑出横向滚动条。 */
.q textarea{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin:0;min-height:0;padding:10px 13px;border:1px solid #dbe6f1;border-radius:11px;outline:none;background:#fbfdff;color:#22384f;font:13px/1.7 inherit;resize:vertical;transition:border .18s,box-shadow .18s}
.q textarea:focus{border-color:#6ea5ec;box-shadow:0 0 0 3px #4b91e91a;background:#fff}
.q textarea::placeholder{color:#a9b8c8}
.q-main textarea{font-size:14px;line-height:1.75}
.q-hint{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#9db0c4;font-size:11px}
.counter{font-variant-numeric:tabular-nums}
.counter.warn{color:#e08b45;font-weight:700}

/* 标签按钮：整块可点，机房触屏也够大 */
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{min-height:32px;padding:0 12px;border:1px solid #dde7f2;border-radius:999px;background:#fbfdff;color:#5c7590;font-size:12.5px;font-family:inherit;cursor:pointer;transition:border .15s,background .15s,color .15s}
.chip:hover{border-color:#b7cfe9;background:#f2f7fe}
.chip.on{border-color:#5f9ae8;background:#eaf3ff;color:#2c6fc9;font-weight:700}

/* 严重程度：三档，人话 */
.severity{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.severity-chip{display:grid;gap:1px;padding:7px 10px;border:1px solid #dde7f2;border-radius:11px;background:#fbfdff;text-align:left;font-family:inherit;cursor:pointer;transition:border .15s,background .15s}
.severity-chip b{color:#44607c;font-size:12.5px}
.severity-chip small{color:#a3b3c5;font-size:10.5px}
.severity-chip:hover{border-color:#b7cfe9}
.severity-chip.on{border-color:#5f9ae8;background:#eaf3ff}
.severity-chip.on b{color:#2c6fc9}
.sev-p0.on,.sev-p1.on{border-color:#efa79e;background:#fff4f2}
.sev-p0.on b,.sev-p1.on b{color:#cc5b4f}

/* 截图：拖进来或点 */
.dropzone{display:grid;justify-items:center;gap:3px;padding:11px 12px;border:1.5px dashed #c3d5e6;border-radius:13px;background:#fafcff;color:#5d92d2;cursor:pointer;transition:border .15s,background .15s}
.dropzone:hover,.dropzone.dragging{border-color:#6ea5ec;background:#eff6ff}
.dropzone span{color:#4f7fae;font-size:12.5px;font-weight:700}
.dropzone small{color:#a4b5c6;font-size:10.5px}
.dropzone input{display:none}
.attachment-preview{display:flex;align-items:center;gap:10px;min-width:0;padding:7px;border:1px solid #dbe8f4;border-radius:11px;background:#fafcff}
.attachment-preview img{width:52px;height:42px;border-radius:7px;object-fit:cover}
.attachment-preview span{overflow:hidden;flex:1;color:#5b7590;font-size:11.5px;text-overflow:ellipsis;white-space:nowrap}
.attachment-preview button{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:8px;background:#fff0ef;color:#d96b64;cursor:pointer}

/* 补充细节：默认收起，保留原有的测试用例字段 */
.more{border:1px solid #e6eef7;border-radius:12px;background:#fafcff}
.more summary{display:flex;align-items:center;gap:7px;padding:11px 13px;color:#5a7590;font-size:12.5px;font-weight:700;cursor:pointer;list-style:none}
.more summary::-webkit-details-marker{display:none}
.more summary small{color:#a4b5c6;font-size:11px;font-weight:400}
.more summary :deep(svg){flex:none;transition:transform .18s}
.more[open] summary :deep(svg:first-child){transform:rotate(180deg)}
.more-body{display:grid;gap:14px;padding:2px 13px 14px}
.env-note{display:flex;align-items:center;gap:7px;color:#9db0c4;font-size:11px}

.form-error{display:flex;align-items:center;gap:7px;margin:0;color:#d65f56;font-size:12px}
.form-footer{display:flex;align-items:center;gap:12px;padding-top:2px}
.form-footer button{display:flex;align-items:center;justify-content:center;gap:8px;min-width:150px;min-height:44px;padding:0 22px;border:0;border-radius:11px;background:linear-gradient(120deg,#4a9af0,#3472d4);box-shadow:0 7px 16px #3d80d638;color:#fff;font:700 13.5px/1 inherit;cursor:pointer;transition:filter .15s}
.form-footer button:hover:not(:disabled){filter:brightness(1.05)}
.form-footer button:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
.form-footer span{color:#a3b4c5;font-size:11px}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

.submit-success{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #c9eddf;border-radius:14px;background:#f1fbf7}
.ok-icon{display:grid;place-items:center;width:34px;height:34px;flex:none;border-radius:50%;background:#d8f5e9;color:#149b74}
.ok-text{display:grid;gap:3px;flex:1;min-width:0}
.ok-text b{color:#1c6b53;font-size:13.5px}
.ok-text em{font-style:normal;font-weight:800;letter-spacing:.4px}
.ok-text small{color:#6f958a;font-size:11px}
.submit-success button{padding:7px 12px;border:1px solid #b6e3d1;border-radius:9px;background:#fff;color:#2c8b6c;font:700 11.5px/1 inherit;cursor:pointer}

.login-gate{text-align:center;padding:40px 20px 34px}
.gate-icon{display:grid;place-items:center;width:50px;height:50px;margin:0 auto 14px;border-radius:16px;background:#eef5ff;color:#4388da}
.login-gate h3{margin:0;font-size:16px}
.login-gate p{max-width:320px;margin:8px auto 18px;color:#8193a6;font-size:12.5px;line-height:1.7}
.login-gate button{min-height:40px;padding:0 20px;border:0;border-radius:10px;background:linear-gradient(120deg,#4a9af0,#3472d4);color:#fff;font:700 13px/1 inherit;cursor:pointer}

/* 我的反馈：折叠，不抢主表单的位置 */
.history summary{display:flex;align-items:center;gap:8px;color:#4f6c88;font-size:13px;font-weight:700;cursor:pointer;list-style:none}
.history summary::-webkit-details-marker{display:none}
.history summary small{padding:2px 7px;border-radius:20px;background:#eef4fb;color:#7a94ad;font-size:11px;font-weight:400}
.history summary :deep(svg:first-child){flex:none;transition:transform .18s}
.history[open] summary :deep(svg:first-child){transform:rotate(180deg)}
.history summary button{display:flex;align-items:center;gap:5px;margin-left:auto;padding:4px 8px;border:0;border-radius:7px;background:#f2f7fd;color:#5f88b5;font:600 11px/1 inherit;cursor:pointer}
.report-list{display:grid;margin-top:10px}
.report-list article{display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-top:1px solid #eff3f8}
.report-status{flex:none;margin-top:1px;padding:3px 8px;border-radius:20px;font-size:10.5px;font-weight:700}
.report-status.is-new{background:#fff5e8;color:#bb8325}
.report-status.is-doing{background:#eaf3ff;color:#3a79c4}
.report-status.is-done{background:#e9f8f1;color:#1c8f6b}
.report-body{display:grid;gap:3px;min-width:0}
.report-body b{color:#3d5872;font-size:12.5px;line-height:1.5}
.report-body small{color:#9fb0c2;font-size:10.5px}
.report-empty{margin:10px 0 0;color:#9fb0c2;font-size:12px}

@media (max-width:640px){
  .bug-main{width:calc(100% - 20px);margin:14px auto 36px}
  .bug-card,.history,.login-gate{padding:17px 15px;border-radius:14px}
  .bug-card{gap:15px}
  .severity{grid-template-columns:1fr}
  .form-footer{flex-direction:column;align-items:stretch}
  .form-footer button{width:100%}
  .form-footer span{text-align:center}
}
</style>
