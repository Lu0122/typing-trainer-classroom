const adminState = { passages: [], users: [], progress: [], assignments: [], competitions: [], assignmentUsers: [], assignmentClasses: [], classes: [], unassignedStudents: [], page: 1, pages: 1, passagePage: 1, passagePages: 1, userPage: 1, userPages: 1, progressPage: 1, progressPages: 1, assignmentPage: 1, assignmentPages: 1, classPage: 1, classPages: 1, unassignedPage: 1, unassignedPages: 1, classMembersPage: 1, classMembersPages: 1, classMembersClassId: null, activeView: 'overview', admin: null };

const el = {
  loginView: document.querySelector('#login-view'), adminShell: document.querySelector('#admin-shell'),
  loginForm: document.querySelector('#login-form'), username: document.querySelector('#admin-username-input'), password: document.querySelector('#password-input'),
  togglePassword: document.querySelector('#toggle-password'), loginError: document.querySelector('#login-error'),
  logout: document.querySelector('#logout-button'), navItems: document.querySelectorAll('.admin-nav-item'),
  views: document.querySelectorAll('.admin-view'), currentDate: document.querySelector('#current-date'),
  statAttempts: document.querySelector('#stat-attempts'), statParticipants: document.querySelector('#stat-participants'),
  statParticipantNote: document.querySelector('#stat-participant-note'), statAverage: document.querySelector('#stat-average'), statTop: document.querySelector('#stat-top'), statPassages: document.querySelector('#stat-passages'),
  overviewSpeedChart: document.querySelector('#overview-speed-chart'), overviewActivityChart: document.querySelector('#overview-activity-chart'), overviewModeChart: document.querySelector('#overview-mode-chart'),
  passageSearch: document.querySelector('#passage-search'), passageCount: document.querySelector('#passage-count'),
  passageTable: document.querySelector('#passage-table'), passageEmpty: document.querySelector('#passage-empty'), addPassage: document.querySelector('#add-passage'), passagePagination: document.querySelector('#passage-pagination'), passagePageLabel: document.querySelector('#passage-page-label'), passagePreviousPage: document.querySelector('#passage-previous-page'), passageNextPage: document.querySelector('#passage-next-page'),
  userSearch: document.querySelector('#user-search'), userClassFilter: document.querySelector('#user-class-filter'), userCount: document.querySelector('#user-count'), userTable: document.querySelector('#user-table'), userEmpty: document.querySelector('#user-empty'), refreshUsers: document.querySelector('#refresh-users'), userPagination: document.querySelector('#user-pagination'), userPageLabel: document.querySelector('#user-page-label'), userPreviousPage: document.querySelector('#user-previous-page'), userNextPage: document.querySelector('#user-next-page'),
  studentImportText: document.querySelector('#student-import-text'), studentImportSubmit: document.querySelector('#student-import-submit'), studentImportResult: document.querySelector('#student-import-result'),
  progressSearch: document.querySelector('#progress-search'), progressCount: document.querySelector('#progress-count'), progressTable: document.querySelector('#progress-table'), progressEmpty: document.querySelector('#progress-empty'), refreshProgress: document.querySelector('#refresh-progress'), progressPagination: document.querySelector('#progress-pagination'), progressPageLabel: document.querySelector('#progress-page-label'), progressPreviousPage: document.querySelector('#progress-previous-page'), progressNextPage: document.querySelector('#progress-next-page'),
  progressMonitored: document.querySelector('#progress-monitored'), progressImproving: document.querySelector('#progress-improving'), progressSpeedChange: document.querySelector('#progress-speed-change'), progressWeekSessions: document.querySelector('#progress-week-sessions'),
  assignments: document.querySelector('#assignment-table'), assignmentCount: document.querySelector('#assignment-count'), assignmentEmpty: document.querySelector('#assignment-empty'), assignmentPagination: document.querySelector('#assignment-pagination'), assignmentPageLabel: document.querySelector('#assignment-page-label'), assignmentPreviousPage: document.querySelector('#assignment-previous-page'), assignmentNextPage: document.querySelector('#assignment-next-page'), refreshAssignments: document.querySelector('#refresh-assignments'), assignmentForm: document.querySelector('#assignment-form'), assignmentId: document.querySelector('#assignment-id-input'), assignmentTitle: document.querySelector('#assignment-title-input'), assignmentMode: document.querySelector('#assignment-mode-input'), assignmentLesson: document.querySelector('#assignment-lesson-input'), assignmentAudience: document.querySelector('#assignment-audience-input'), assignmentClassField: document.querySelector('#assignment-class-field'), assignmentClass: document.querySelector('#assignment-class-input'), assignmentStudentsField: document.querySelector('#assignment-students-field'), assignmentStudents: document.querySelector('#assignment-students-input'), assignmentAccuracy: document.querySelector('#assignment-accuracy-input'), assignmentSpeed: document.querySelector('#assignment-speed-input'), assignmentDue: document.querySelector('#assignment-due-input'), assignmentDescription: document.querySelector('#assignment-description-input'), assignmentSubmit: document.querySelector('#assignment-submit'), assignmentCancelEdit: document.querySelector('#assignment-cancel-edit'),
  classes: document.querySelector('#class-table'), classCount: document.querySelector('#class-count'), classEmpty: document.querySelector('#class-empty'), classPagination: document.querySelector('#class-pagination'), classPageLabel: document.querySelector('#class-page-label'), classPreviousPage: document.querySelector('#class-previous-page'), classNextPage: document.querySelector('#class-next-page'), refreshClasses: document.querySelector('#refresh-classes'), classForm: document.querySelector('#class-form'), classId: document.querySelector('#class-id-input'), className: document.querySelector('#class-name-input'), classTerm: document.querySelector('#class-term-input'), classDescription: document.querySelector('#class-description-input'), classSubmit: document.querySelector('#class-submit'), classCancelEdit: document.querySelector('#class-cancel-edit'), classTarget: document.querySelector('#class-target-input'), classAssignForm: document.querySelector('#class-assign-form'), classStudents: document.querySelector('#class-students-input'), classMembersPanel: document.querySelector('#class-members-panel'), classMembersTitle: document.querySelector('#class-members-title'), classMembersTable: document.querySelector('#class-members-table'), classMembersEmpty: document.querySelector('#class-members-empty'), classMembersPagination: document.querySelector('#class-members-pagination'), classMembersPageLabel: document.querySelector('#class-members-page-label'), classMembersPreviousPage: document.querySelector('#class-members-previous-page'), classMembersNextPage: document.querySelector('#class-members-next-page'), classOverviewContent: document.querySelector('#class-overview-content'), classMetricMembers: document.querySelector('#class-metric-members'), classMetricActive: document.querySelector('#class-metric-active'), classMetricSessions: document.querySelector('#class-metric-sessions'), classMetricMinutes: document.querySelector('#class-metric-minutes'), classMetricSpeed: document.querySelector('#class-metric-speed'), classMetricAccuracy: document.querySelector('#class-metric-accuracy'), classOverviewTasks: document.querySelector('#class-overview-tasks'), classOverviewTasksEmpty: document.querySelector('#class-overview-tasks-empty'), classOverviewRisks: document.querySelector('#class-overview-risks'), classOverviewRisksEmpty: document.querySelector('#class-overview-risks-empty'), classOverviewRanking: document.querySelector('#class-overview-ranking'), classOverviewRankingEmpty: document.querySelector('#class-overview-ranking-empty'), closeClassMembers: document.querySelector('#close-class-members'), unassignedTable: document.querySelector('#unassigned-table'), unassignedCount: document.querySelector('#unassigned-count'), unassignedEmpty: document.querySelector('#unassigned-empty'), unassignedPagination: document.querySelector('#unassigned-pagination'), unassignedPageLabel: document.querySelector('#unassigned-page-label'), unassignedPreviousPage: document.querySelector('#unassigned-previous-page'), unassignedNextPage: document.querySelector('#unassigned-next-page'),
  scoreTable: document.querySelector('#score-table'), scoreCount: document.querySelector('#score-count'), scoreEmpty: document.querySelector('#score-empty'),
  scorePagination: document.querySelector('#score-pagination'), pageLabel: document.querySelector('#page-label'), previousPage: document.querySelector('#previous-page'), nextPage: document.querySelector('#next-page'), refreshScores: document.querySelector('#refresh-scores'),
  competitionForm: document.querySelector('#competition-form'), competitionName: document.querySelector('#competition-name-input'), competitionMode: document.querySelector('#competition-mode-input'), competitionSchedule: document.querySelector('#competition-schedule-input'), competitionDuration: document.querySelector('#competition-duration-input'), competitionSeries: document.querySelector('#competition-series-input'), competitionSideA: document.querySelector('#competition-side-a-input'), competitionSideB: document.querySelector('#competition-side-b-input'), competitionSideNames: document.querySelector('#competition-side-names-input'), competitionTeamSize: document.querySelector('#competition-team-size-input'), competitionTeamFields: document.querySelectorAll('.competition-team-field'), competitionLeagueFields: document.querySelectorAll('.competition-league-field'), competitionTable: document.querySelector('#competition-table'), competitionCount: document.querySelector('#competition-count'), competitionEmpty: document.querySelector('#competition-empty'), refreshCompetitions: document.querySelector('#refresh-competitions'),
  battleCompetitionStatus: document.querySelector('#battle-competition-status'), battleCompetitionSummary: document.querySelector('#battle-competition-summary'), battleCompetitionRoster: document.querySelector('#battle-competition-roster'), battleCompetitionDuration: document.querySelector('#battle-competition-duration'), battleCompetitionPrepare: document.querySelector('#battle-competition-prepare'), battleCompetitionStart: document.querySelector('#battle-competition-start'),
  dialog: document.querySelector('#passage-dialog'), passageForm: document.querySelector('#passage-form'), dialogTitle: document.querySelector('#passage-dialog-title'),
  passageId: document.querySelector('#passage-id'), passageTitle: document.querySelector('#passage-title-input'), passageCategory: document.querySelector('#passage-category-input'),
  passageContent: document.querySelector('#passage-content-input'), passageActive: document.querySelector('#passage-active-input'), contentCounter: document.querySelector('#content-counter'),
  closeDialog: document.querySelector('#close-passage-dialog'), cancelPassage: document.querySelector('#cancel-passage'),
  resetDialog: document.querySelector('#password-reset-dialog'), resetForm: document.querySelector('#password-reset-form'), resetUserId: document.querySelector('#reset-user-id'), resetUserName: document.querySelector('#reset-user-name'), resetPassword: document.querySelector('#reset-password-input'), resetPasswordConfirm: document.querySelector('#reset-password-confirm'), resetError: document.querySelector('#reset-password-error'), closeReset: document.querySelector('#close-password-reset'), cancelReset: document.querySelector('#cancel-password-reset'),
  progressDialog: document.querySelector('#progress-dialog'), closeProgressDialog: document.querySelector('#close-progress-dialog'), progressStudentName: document.querySelector('#progress-student-name'), progressDialogSummary: document.querySelector('#progress-dialog-summary'), progressChart: document.querySelector('#progress-chart'), progressModeList: document.querySelector('#progress-mode-list'), progressRecentList: document.querySelector('#progress-recent-list'),
  mobileMenu: document.querySelector('#mobile-menu-button'), sidebar: document.querySelector('.admin-sidebar'), toast: document.querySelector('#admin-toast')
};

el.adminAccountForm = document.querySelector('#admin-account-form');
el.adminAccountUsername = document.querySelector('#admin-account-username');
el.adminAccountDisplayName = document.querySelector('#admin-account-display-name');
el.adminAccountPassword = document.querySelector('#admin-account-password');
el.adminAccountRole = document.querySelector('#admin-account-role');
el.adminAccountTable = document.querySelector('#admin-account-table');
el.adminAccountCount = document.querySelector('#admin-account-count');
el.adminAccountEmpty = document.querySelector('#admin-account-empty');

el.competitionPool = document.querySelector('#competition-pool');
el.competitionPoolList = document.querySelector('#competition-pool-list');
el.competitionPoolCount = document.querySelector('#competition-pool-count');
el.competitionPoolTip = document.querySelector('#competition-pool-tip');
el.competitionPoolClear = document.querySelector('#competition-pool-clear');

el.battlePool = document.querySelector('#battle-pool');
el.battlePoolList = document.querySelector('#battle-pool-list');
el.battlePoolCount = document.querySelector('#battle-pool-count');
el.battlePoolTip = document.querySelector('#battle-pool-tip');
el.battlePoolClear = document.querySelector('#battle-pool-clear');

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || '请求失败');
    error.status = response.status;
    throw error;
  }
  return body;
}

let toastTimer;
const adminCharts = {};
function debounce(handler, delay = 220) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => handler(...args), delay); };
}
function toast(message, error = false) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.classList.toggle('is-error', error);
  el.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2400);
}

function setAuthenticated(authenticated) {
  el.loginView.hidden = authenticated;
  el.adminShell.hidden = !authenticated;
  const adminNav = [...el.navItems].find((item) => item.dataset.view === 'admins');
  if (adminNav) adminNav.hidden = authenticated && adminState.admin?.role !== 'superadmin';
  if (!authenticated) setTimeout(() => el.password.focus(), 0);
}

function renderAdminAccounts(rows) {
  el.adminAccountCount.textContent = `共 ${rows.length} 个`;
  el.adminAccountEmpty.hidden = rows.length > 0;
  el.adminAccountTable.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.className = 'student-cell';
    const strong = document.createElement('strong'); strong.textContent = item.displayName;
    const small = document.createElement('span'); small.textContent = item.username; name.append(strong, small);
    const role = document.createElement('td'); role.textContent = item.role === 'superadmin' ? '超级管理员' : '普通管理员';
    const status = document.createElement('td'); const pill = document.createElement('span');
    pill.className = `status-pill ${item.isActive ? '' : 'is-inactive'}`; pill.textContent = item.isActive ? '启用中' : '已停用'; status.append(pill);
    const last = document.createElement('td'); last.textContent = formatDate(item.lastLoginAt);
    const created = document.createElement('td'); created.textContent = formatDate(item.createdAt);
    const actions = document.createElement('td'); actions.className = 'table-actions';
    if (item.id !== adminState.admin?.id) {
      actions.append(actionButton(item.isActive ? 'user-round-x' : 'user-round-check', item.isActive ? '停用账号' : '启用账号', '', async () => {
        try { await api(`/api/admin/admins/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) }); toast(item.isActive ? '管理员已停用' : '管理员已启用'); await loadAdminAccounts(); } catch (error) { toast(error.message, true); }
      }));
      actions.append(actionButton('key-round', '重置密码', '', async () => {
        const password = window.prompt(`请输入 ${item.username} 的新密码（6-12 位字母或数字）`);
        if (!password) return;
        try { await api(`/api/admin/admins/${item.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }); toast('密码已重置'); } catch (error) { toast(error.message, true); }
      }));
    }
    row.append(name, role, status, last, created, actions); return row;
  }));
  window.lucide?.createIcons();
}
async function loadAdminAccounts() { const data = await api('/api/admin/admins'); renderAdminAccounts(data.rows || []); }

function formatDate(value) {
  if (!value) return '--';
  const date = typeof value === 'number'
    ? new Date(value)
    : new Date(String(value).includes('T') || String(value).endsWith('Z') ? value : `${String(value).replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '--';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function loadStats() {
  const stats = await api('/api/admin/stats');
  el.statAttempts.textContent = stats.attempts;
  el.statParticipants.textContent = stats.registeredUsers;
  el.statParticipantNote.textContent = `${stats.participants} 人参加竞速`;
  el.statAverage.textContent = stats.averageScore;
  el.statTop.textContent = stats.topScore;
  el.statPassages.textContent = `${stats.activePassages} 篇文章正在使用`;
}

const modeNames = { beginner: '新手入门', 'english-word': '英文单词', 'english-phrase': '英文语句', 'english-article': '英文文章', 'pinyin-syllable': '拼音音节', 'pinyin-word': '拼音词组', 'pinyin-article': '拼音文章', battle: '占领战', boss: '全班打 Boss', race: '打字赛车', rhythm: '节奏连击', runner: '遗迹逃亡', challenge: '一分钟挑战' };
function renderOverviewCharts(overview) {
  if (!window.echarts || !el.overviewSpeedChart) return;
  const daily = overview.daily || [];
  const dates = daily.map((item) => item.date.slice(5));
  const init = (element, key) => { if (!adminCharts[key]) adminCharts[key] = window.echarts.init(element); return adminCharts[key]; };
  init(el.overviewSpeedChart, 'speed').setOption({ color: ['#1f9d61'], tooltip: { trigger: 'axis' }, grid: { left: 42, right: 20, top: 20, bottom: 28 }, xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#d7dfd8' } }, axisLabel: { color: '#718095', fontSize: 10 } }, yAxis: { type: 'value', min: 0, splitLine: { lineStyle: { color: '#e8eee9' } }, axisLabel: { color: '#718095', fontSize: 10 } }, series: [{ type: 'line', smooth: true, symbol: 'circle', symbolSize: 6, data: daily.map((item) => item.speed || 0), areaStyle: { color: 'rgba(31,157,97,.12)' }, lineStyle: { width: 3 } }] });
  init(el.overviewActivityChart, 'activity').setOption({ color: ['#2e86de'], tooltip: { trigger: 'axis' }, grid: { left: 42, right: 20, top: 20, bottom: 28 }, xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: '#d7dfd8' } }, axisLabel: { color: '#718095', fontSize: 10 } }, yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e8eee9' } }, axisLabel: { color: '#718095', fontSize: 10 } }, series: [{ type: 'bar', barMaxWidth: 18, data: daily.map((item) => item.sessions || 0), itemStyle: { borderRadius: [4, 4, 0, 0] } }] });
  const modeData = Object.entries(overview.modes || {}).map(([name, value]) => ({ name: modeNames[name] || name, value }));
  init(el.overviewModeChart, 'mode').setOption({ tooltip: { trigger: 'item' }, legend: { bottom: 0, type: 'scroll', textStyle: { color: '#718095', fontSize: 11 } }, series: [{ type: 'pie', radius: ['42%', '70%'], center: ['50%', '44%'], itemStyle: { borderColor: '#fff', borderWidth: 3 }, label: { color: '#314452', fontSize: 11 }, data: modeData.length ? modeData : [{ name: '暂无训练', value: 1 }] }] });
}
async function loadProgressOverview() { const overview = await api('/api/admin/progress/overview'); renderOverviewCharts(overview); return overview; }
window.addEventListener('resize', () => Object.values(adminCharts).forEach((chart) => chart.resize()));

function textCell(title, preview) {
  const cell = document.createElement('td');
  cell.className = 'article-cell';
  const strong = document.createElement('strong');
  strong.textContent = title;
  const span = document.createElement('span');
  span.textContent = preview;
  cell.append(strong, span);
  return cell;
}

function actionButton(icon, label, className, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `table-action ${className || ''}`.trim();
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<i data-lucide="${icon}"></i>`;
  button.addEventListener('click', handler);
  return button;
}

function renderPassages() {
  const rows = adminState.passages;
  el.passageCount.textContent = `共 ${adminState.passageTotal || 0} 篇`;
  el.passageEmpty.hidden = rows.length > 0;
  el.passageTable.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    row.append(textCell(item.title, item.content));

    const category = document.createElement('td'); category.textContent = item.category;
    const count = document.createElement('td'); count.textContent = Array.from(item.content).length;
    const status = document.createElement('td');
    const pill = document.createElement('span'); pill.className = `status-pill ${item.isActive ? '' : 'is-inactive'}`; pill.textContent = item.isActive ? '使用中' : '已停用'; status.append(pill);
    const updated = document.createElement('td'); updated.textContent = formatDate(item.updatedAt);
    const actions = document.createElement('td'); actions.className = 'table-actions';
    actions.append(
      actionButton('pencil', '编辑文章', '', () => openPassageDialog(item)),
      actionButton('trash-2', '删除文章', 'is-danger', () => deletePassage(item))
    );
    row.append(category, count, status, updated, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

async function loadPassages() {
  const query = new URLSearchParams({ page: adminState.passagePage, q: el.passageSearch.value.trim() });
  const data = await api(`/api/admin/passages?${query}`);
  adminState.passages = data.rows;
  adminState.passagePage = data.page; adminState.passagePages = data.pages; adminState.passageTotal = data.total;
  el.passagePagination.hidden = data.total <= data.pageSize;
  el.passagePageLabel.textContent = `第 ${data.page} / ${data.pages} 页`;
  el.passagePreviousPage.disabled = data.page <= 1; el.passageNextPage.disabled = data.page >= data.pages;
  renderPassages();
}

function openPassageDialog(item = null) {
  el.passageForm.reset();
  el.passageId.value = item?.id || '';
  el.passageTitle.value = item?.title || '';
  el.passageCategory.value = item?.category || '';
  el.passageContent.value = item?.content || '';
  el.passageActive.checked = item ? Boolean(item.isActive) : true;
  el.dialogTitle.textContent = item ? '编辑文章' : '新增文章';
  el.contentCounter.textContent = `${Array.from(el.passageContent.value).length} / 2000`;
  el.dialog.showModal();
  setTimeout(() => el.passageTitle.focus(), 0);
}

async function deletePassage(item) {
  if (!confirm(`确定删除《${item.title}》吗？相关历史成绩会保留。`)) return;
  try {
    await api(`/api/admin/passages/${item.id}`, { method: 'DELETE' });
    toast('文章已删除');
    await Promise.all([loadPassages(), loadStats()]);
  } catch (error) { toast(error.message, true); }
}

async function savePassage(event) {
  event.preventDefault();
  const id = el.passageId.value;
  const body = JSON.stringify({ title: el.passageTitle.value, category: el.passageCategory.value, content: el.passageContent.value, isActive: el.passageActive.checked });
  try {
    await api(id ? `/api/admin/passages/${id}` : '/api/admin/passages', { method: id ? 'PUT' : 'POST', body });
    el.dialog.close();
    toast(id ? '文章已更新' : '文章已创建');
    await Promise.all([loadPassages(), loadStats()]);
  } catch (error) { toast(error.message, true); }
}

function renderUsers() {
  const rows = adminState.users;
  el.userCount.textContent = `共 ${adminState.userTotal || 0} 个账号`;
  el.userEmpty.hidden = rows.length > 0;
  el.userTable.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const student = document.createElement('td'); student.className = 'student-cell';
    const name = document.createElement('strong'); name.textContent = item.displayName;
    const username = document.createElement('span'); username.textContent = `@${item.username}`;
    student.append(name, username);
    const attempts = document.createElement('td'); attempts.textContent = item.attempts;
    const best = document.createElement('td'); best.className = 'score-number'; best.textContent = item.personalBest;
    const status = document.createElement('td');
    const pill = document.createElement('span'); pill.className = `status-pill ${item.isActive ? '' : 'is-inactive'}`; pill.textContent = item.isActive ? '正常' : (item.lastLoginAt ? '已停用' : '待启用'); status.append(pill);
    const lastLogin = document.createElement('td'); lastLogin.textContent = formatDate(item.lastLoginAt);
    const created = document.createElement('td'); created.textContent = formatDate(item.createdAt);
    const actions = document.createElement('td'); actions.className = 'table-actions';
    actions.append(
      actionButton('key-round', '重置密码', '', () => openPasswordReset(item)),
      actionButton(item.isActive ? 'user-x' : 'user-check', item.isActive ? '停用账号' : '启用账号', item.isActive ? 'is-danger' : '', () => toggleUserStatus(item))
    );
    row.append(student, attempts, best, status, lastLogin, created, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

async function loadUsers() {
  const query = new URLSearchParams({ page: adminState.userPage, q: el.userSearch.value.trim(), classId: el.userClassFilter.value });
  const data = await api(`/api/admin/users?${query}`);
  adminState.users = data.rows;
  adminState.userPage = data.page; adminState.userPages = data.pages; adminState.userTotal = data.total;
  el.userPagination.hidden = data.total <= data.pageSize;
  el.userPageLabel.textContent = `第 ${data.page} / ${data.pages} 页`;
  el.userPreviousPage.disabled = data.page <= 1; el.userNextPage.disabled = data.page >= data.pages;
  renderUsers();
}

async function loadUserClassFilter() {
  const current = el.userClassFilter.value;
  const data = await api('/api/admin/classes?all=true');
  el.userClassFilter.replaceChildren(new Option('全部班级', ''), new Option('待分班', 'unassigned'), ...(data.rows || []).map((item) => new Option(item.term ? `${item.name} · ${item.term}` : item.name, item.id)));
  if ([...el.userClassFilter.options].some((option) => option.value === current)) el.userClassFilter.value = current;
}

function modeLabel(mode) {
  return ({ beginner: '新手入门', 'english-word': '英文单词', 'english-phrase': '英文语句', 'english-article': '英文文章', 'pinyin-syllable': '拼音音节', 'pinyin-word': '拼音词组', 'pinyin-article': '拼音文章', battle: '占领战', boss: '全班打 Boss', race: '打字赛车', rhythm: '节奏连击', runner: '遗迹逃亡', challenge: '一分钟挑战' })[mode] || mode;
}

function changeText(value, suffix = '') {
  if (value === null || value === undefined) return '训练不足';
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${number}${suffix}`;
}

function renderProgress() {
  const rows = adminState.progress;
  el.progressCount.textContent = `共 ${adminState.progressTotal || 0} 名学生`;
  el.progressEmpty.hidden = rows.length > 0;
  el.progressTable.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const student = document.createElement('td'); student.className = 'student-cell';
    const name = document.createElement('strong'); name.textContent = item.displayName;
    const username = document.createElement('span'); username.textContent = `@${item.username}`;
    student.append(name, username);
    const sessions = document.createElement('td'); sessions.textContent = item.sessions;
    const dailyHours = document.createElement('td'); dailyHours.textContent = item.activeDays ? `${item.dailyHours} 小时` : '--';
    const firstSpeed = document.createElement('td'); firstSpeed.textContent = item.sessions ? `${item.firstSpeed}` : '--';
    const recentSpeed = document.createElement('td'); recentSpeed.textContent = item.sessions ? `${item.recentSpeed}` : '--';
    const speed = document.createElement('td'); speed.className = `progress-change ${item.speedChange > 0 ? 'is-up' : item.speedChange < 0 ? 'is-down' : ''}`; speed.textContent = changeText(item.speedChange, ' 字/分');
    const accuracy = document.createElement('td'); accuracy.className = `progress-change ${item.accuracyChange > 0 ? 'is-up' : item.accuracyChange < 0 ? 'is-down' : ''}`; accuracy.textContent = changeText(item.accuracyChange, '%');
    const latest = document.createElement('td'); latest.textContent = formatDate(item.latestAt);
    const actions = document.createElement('td'); actions.className = 'table-actions'; actions.append(actionButton('chart-no-axes-combined', '查看进步详情', '', () => openProgressDialog(item)));
    row.append(student, sessions, dailyHours, firstSpeed, recentSpeed, speed, accuracy, latest, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

async function loadProgress() {
  const query = new URLSearchParams({ page: adminState.progressPage, q: el.progressSearch.value.trim() });
  const [overview, students] = await Promise.all([api('/api/admin/progress/overview'), api(`/api/admin/progress/students?${query}`)]);
  renderOverviewCharts(overview);
  adminState.progress = students.rows;
  adminState.progressPage = students.page; adminState.progressPages = students.pages; adminState.progressTotal = students.total;
  el.progressMonitored.textContent = overview.monitoredStudents;
  el.progressImproving.textContent = overview.improvingStudents;
  el.progressSpeedChange.textContent = changeText(overview.averageSpeedChange);
  el.progressWeekSessions.textContent = overview.sessionsLast7Days;
  el.progressPagination.hidden = students.total <= students.pageSize;
  el.progressPageLabel.textContent = `第 ${students.page} / ${students.pages} 页`;
  el.progressPreviousPage.disabled = students.page <= 1; el.progressNextPage.disabled = students.page >= students.pages;
  renderProgress();
}

const assignmentModeNames = { all: '所有课程', beginner: '新手入门', 'english-word': '英文单词', 'english-phrase': '英文语句', 'english-article': '英文文章', 'pinyin-syllable': '拼音音节', 'pinyin-word': '拼音词组', 'pinyin-article': '拼音文章' };
function renderAssignments() {
  const rows = adminState.assignments;
  el.assignmentCount.textContent = `共 ${adminState.assignmentTotal || 0} 个`;
  el.assignmentEmpty.hidden = rows.length > 0;
  el.assignmentPagination.hidden = (adminState.assignmentTotal || 0) <= (adminState.assignmentPageSize || 20);
  el.assignmentPageLabel.textContent = `第 ${adminState.assignmentPage} / ${adminState.assignmentPages} 页`;
  el.assignmentPreviousPage.disabled = adminState.assignmentPage <= 1;
  el.assignmentNextPage.disabled = adminState.assignmentPage >= adminState.assignmentPages;
  el.assignments.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const title = document.createElement('td'); title.className = 'article-cell';
    const titleText = document.createElement('strong'); titleText.textContent = item.title;
    const description = document.createElement('span'); description.textContent = item.description || '未填写任务说明';
    title.append(titleText, description);
    const mode = document.createElement('td'); mode.textContent = item.lessonTitle ? `${assignmentModeNames[item.mode] || item.mode} · ${item.lessonTitle}` : (assignmentModeNames[item.mode] || item.mode);
    const target = document.createElement('td'); target.textContent = item.audience === 'class' ? `班级：${item.className || '已删除班级'}` : [Number(item.targetAccuracy) ? `准确率 ${item.targetAccuracy}%` : '', Number(item.targetSpeed) ? `速度 ${item.targetSpeed}` : ''].filter(Boolean).join(' / ') || '完成练习';
    const due = document.createElement('td'); due.textContent = item.dueAt ? formatDate(new Date(item.dueAt).toISOString()) : '不限时';
    const progress = document.createElement('td'); progress.textContent = `${item.completedCount || 0} / ${item.targetCount || 0} 人完成（${item.completionRate || 0}%）`;
    const status = document.createElement('td'); const pill = document.createElement('span'); pill.className = `status-pill ${item.isActive ? '' : 'is-inactive'}`; pill.textContent = item.isActive ? '进行中' : '已停用'; status.append(pill);
    const actions = document.createElement('td'); actions.className = 'table-actions'; actions.append(actionButton('pencil', '编辑任务', '', () => openAssignmentEdit(item)), actionButton(item.isActive ? 'pause' : 'play', item.isActive ? '停用任务' : '启用任务', item.isActive ? 'is-danger' : '', () => toggleAssignment(item)));
    row.append(title, mode, target, due, progress, status, actions);
    return row;
  }));
  window.lucide?.createIcons();
}
async function loadAssignments() {
  const data = await api(`/api/admin/assignments?page=${adminState.assignmentPage}`);
  adminState.assignments = data.rows || [];
  adminState.assignmentPage = data.page; adminState.assignmentPages = data.pages; adminState.assignmentPageSize = data.pageSize; adminState.assignmentTotal = data.total;
  renderAssignments();
}
async function loadAssignmentUsers() {
  const first = await api('/api/admin/users?page=1&pageSize=50');
  const pages = first.pages || 1;
  const rest = pages > 1 ? await Promise.all(Array.from({ length: pages - 1 }, (_, index) => api(`/api/admin/users?page=${index + 2}&pageSize=50`))) : [];
  adminState.assignmentUsers = [first, ...rest].flatMap((page) => page.rows || []).filter((user) => user.isActive);
  el.assignmentStudents.replaceChildren(...adminState.assignmentUsers.map((user) => { const option = document.createElement('option'); option.value = user.id; option.textContent = `${user.displayName}（${user.username}）`; return option; }));
}
async function loadAssignmentClasses() {
  const data = await api('/api/admin/classes?all=true');
  adminState.assignmentClasses = (data.rows || []).filter((item) => item.isActive);
  el.assignmentClass.replaceChildren(...(adminState.assignmentClasses.length ? adminState.assignmentClasses.map((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.term ? `${item.name} · ${item.term}` : item.name; return option; }) : [Object.assign(document.createElement('option'), { textContent: '暂无启用班级', disabled: true })]));
}
function setAssignmentAudience(value) {
  const selected = value === 'selected';
  const classAudience = value === 'class';
  el.assignmentStudentsField.classList.toggle('is-visible', selected);
  el.assignmentClassField.classList.toggle('is-visible', classAudience);
  el.assignmentStudents.required = selected;
  el.assignmentClass.required = classAudience;
}
function resetAssignmentForm() {
  el.assignmentForm.reset();
  el.assignmentId.value = '';
  el.assignmentAudience.value = 'all';
  el.assignmentClass.value = '';
  [...el.assignmentStudents.options].forEach((option) => { option.selected = false; });
  setAssignmentAudience('all');
  el.assignmentSubmit.innerHTML = '<i data-lucide="plus"></i><span>发布任务</span>';
  el.assignmentCancelEdit.hidden = true;
  window.lucide?.createIcons();
}
function openAssignmentEdit(item) {
  el.assignmentId.value = item.id;
  el.assignmentTitle.value = item.title || '';
  el.assignmentMode.value = item.mode || 'all';
  el.assignmentLesson.value = item.lessonTitle || '';
  el.assignmentAudience.value = item.audience || 'all';
  el.assignmentClass.value = item.classId || '';
  el.assignmentAccuracy.value = Number(item.targetAccuracy) || '';
  el.assignmentSpeed.value = Number(item.targetSpeed) || '';
  el.assignmentDescription.value = item.description || '';
  el.assignmentDue.value = item.dueAt ? new Date(item.dueAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
  const selectedIds = new Set((item.studentIds || []).map(Number));
  [...el.assignmentStudents.options].forEach((option) => { option.selected = selectedIds.has(Number(option.value)); });
  setAssignmentAudience(el.assignmentAudience.value);
  el.assignmentSubmit.innerHTML = '<i data-lucide="save"></i><span>保存修改</span>';
  el.assignmentCancelEdit.hidden = false;
  el.assignmentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.lucide?.createIcons();
}
async function saveAssignment(event) {
  event.preventDefault();
  const dueValue = el.assignmentDue.value ? new Date(el.assignmentDue.value).getTime() : null;
  const id = el.assignmentId.value;
  try {
    await api(id ? `/api/admin/assignments/${id}` : '/api/admin/assignments', { method: id ? 'PUT' : 'POST', body: JSON.stringify({
      title: el.assignmentTitle.value, description: el.assignmentDescription.value,
      mode: el.assignmentMode.value, lessonTitle: el.assignmentLesson.value, classId: el.assignmentAudience.value === 'class' ? Number(el.assignmentClass.value) : null,
      audience: el.assignmentAudience.value, studentIds: [...el.assignmentStudents.selectedOptions].map((option) => Number(option.value)),
      targetAccuracy: el.assignmentAccuracy.value, targetSpeed: el.assignmentSpeed.value,
      dueAt: dueValue
    }) });
    resetAssignmentForm();
    toast(id ? '教学任务已更新' : '教学任务已发布');
    await loadAssignments();
  } catch (error) { toast(error.message, true); }
}
async function toggleAssignment(item) {
  try {
    await api(`/api/admin/assignments/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) });
    toast(item.isActive ? '任务已停用' : '任务已启用');
    await loadAssignments();
  } catch (error) { toast(error.message, true); }
}

function renderClasses() {
  const rows = adminState.classes;
  el.classCount.textContent = `共 ${adminState.classTotal || 0} 个班级`;
  el.classEmpty.hidden = rows.length > 0;
  el.classPagination.hidden = (adminState.classTotal || 0) <= (adminState.classPageSize || 20);
  el.classPageLabel.textContent = `第 ${adminState.classPage} / ${adminState.classPages} 页`;
  el.classPreviousPage.disabled = adminState.classPage <= 1;
  el.classNextPage.disabled = adminState.classPage >= adminState.classPages;
  el.classes.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const title = document.createElement('td'); title.className = 'article-cell';
    const titleText = document.createElement('strong'); titleText.textContent = item.name;
    const description = document.createElement('span'); description.textContent = item.description || '未填写说明';
    title.append(titleText, description);
    const term = document.createElement('td'); term.textContent = item.term || '--';
    const count = document.createElement('td'); count.className = 'class-member-count'; count.textContent = `${item.memberCount || 0} 人`;
    const status = document.createElement('td'); const pill = document.createElement('span'); pill.className = `class-status ${item.isActive ? '' : 'is-inactive'}`; pill.textContent = item.isActive ? '启用' : '停用'; status.append(pill);
    const note = document.createElement('td'); note.className = 'class-description-cell'; note.textContent = item.description || '--';
    const actions = document.createElement('td'); actions.className = 'table-actions';
    actions.append(actionButton('users', '查看成员', '', () => loadClassMembers(item)), actionButton('pencil', '编辑班级', '', () => openClassEdit(item)), actionButton(item.isActive ? 'pause' : 'play', item.isActive ? '停用班级' : '启用班级', item.isActive ? 'is-danger' : '', () => toggleClass(item)));
    row.append(title, term, count, status, note, actions);
    return row;
  }));
  const activeClasses = rows.filter((item) => item.isActive);
  el.classTarget.replaceChildren(...(activeClasses.length ? activeClasses.map((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.term ? `${item.name} · ${item.term}` : item.name; return option; }) : [Object.assign(document.createElement('option'), { textContent: '请先创建并启用班级', disabled: true })]));
  window.lucide?.createIcons();
}

function renderUnassignedStudents() {
  const rows = adminState.unassignedStudents;
  el.unassignedCount.textContent = `${adminState.unassignedTotal || 0} 人`;
  el.unassignedEmpty.hidden = rows.length > 0;
  el.unassignedPagination.hidden = (adminState.unassignedTotal || 0) <= (adminState.unassignedPageSize || 20);
  el.unassignedPageLabel.textContent = `第 ${adminState.unassignedPage} / ${adminState.unassignedPages} 页`;
  el.unassignedPreviousPage.disabled = adminState.unassignedPage <= 1;
  el.unassignedNextPage.disabled = adminState.unassignedPage >= adminState.unassignedPages;
  el.unassignedTable.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const student = document.createElement('td'); student.className = 'student-cell';
    const name = document.createElement('strong'); name.textContent = item.displayName;
    const username = document.createElement('span'); username.textContent = `@${item.username}`;
    student.append(name, username);
    const created = document.createElement('td'); created.textContent = formatDate(item.createdAt);
    const lastLogin = document.createElement('td'); lastLogin.textContent = formatDate(item.lastLoginAt);
    row.append(student, created, lastLogin);
    return row;
  }));
}

async function loadClasses() {
  const [classes, unassigned, allUnassigned] = await Promise.all([
    api(`/api/admin/classes?page=${adminState.classPage}`),
    api(`/api/admin/classes/unassigned/students?page=${adminState.unassignedPage}`),
    api('/api/admin/classes/unassigned/students?all=true')
  ]);
  adminState.classes = classes.rows || [];
  adminState.unassignedStudents = unassigned.rows || [];
  adminState.classPage = classes.page; adminState.classPages = classes.pages; adminState.classPageSize = classes.pageSize; adminState.classTotal = classes.total;
  adminState.unassignedPage = unassigned.page; adminState.unassignedPages = unassigned.pages; adminState.unassignedPageSize = unassigned.pageSize; adminState.unassignedTotal = unassigned.total;
  renderClasses(); renderUnassignedStudents();
  el.classStudents.replaceChildren(...(allUnassigned.rows || []).map((user) => { const option = document.createElement('option'); option.value = user.id; option.textContent = `${user.displayName}（${user.username}）`; return option; }));
}

async function loadClassMembers(item) {
  try {
    const data = await api(`/api/admin/classes/${item.id}/members?page=${adminState.classMembersPage}`);
    await loadClassOverview(item);
    adminState.classMembersClassId = item.id; adminState.classMembersPage = data.page; adminState.classMembersPages = data.pages; adminState.classMembersPageSize = data.pageSize; adminState.classMembersTotal = data.total;
    el.classMembersTitle.textContent = `${data.class.name} · 成员`;
    el.classMembersPanel.hidden = false;
    el.classMembersEmpty.hidden = data.rows.length > 0;
    el.classMembersPagination.hidden = (data.total || 0) <= (data.pageSize || 20);
    el.classMembersPageLabel.textContent = `第 ${data.page} / ${data.pages} 页`;
    el.classMembersPreviousPage.disabled = data.page <= 1;
    el.classMembersNextPage.disabled = data.page >= data.pages;
    el.classMembersTable.replaceChildren(...data.rows.map((member) => {
      const row = document.createElement('tr');
      const student = document.createElement('td'); student.className = 'student-cell';
      const name = document.createElement('strong'); name.textContent = member.displayName;
      const username = document.createElement('span'); username.textContent = `@${member.username}`;
      student.append(name, username);
      const joined = document.createElement('td'); joined.textContent = formatDate(member.joinedAt);
      const actions = document.createElement('td'); actions.className = 'table-actions'; actions.append(actionButton('user-minus', '移出班级', 'is-danger', () => removeClassMember(item, member)));
      row.append(student, joined, actions);
      return row;
    }));
    window.lucide?.createIcons();
    el.classMembersPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { toast(error.message, true); }
}

function renderClassOverview(data) {
  const metrics = data.metrics || {};
  el.classOverviewContent.hidden = false;
  el.classMetricMembers.textContent = metrics.memberCount || 0;
  el.classMetricActive.textContent = metrics.activeToday || 0;
  el.classMetricSessions.textContent = metrics.sessionsWeek || 0;
  el.classMetricMinutes.textContent = `${metrics.minutesWeek || 0} 分钟`;
  el.classMetricSpeed.textContent = metrics.averageSpeed || 0;
  el.classMetricAccuracy.textContent = `准确率 ${metrics.averageAccuracy || 0}%`;
  el.classOverviewTasks.replaceChildren(...(data.tasks || []).map((task) => {
    const row = document.createElement('div'); row.className = 'class-overview-row';
    const title = document.createElement('strong'); title.textContent = task.title;
    const meta = document.createElement('span'); meta.textContent = `${task.completedCount}/${task.targetCount} 人完成 · ${task.completionRate}%`;
    row.append(title, meta); return row;
  }));
  el.classOverviewTasksEmpty.hidden = (data.tasks || []).length > 0;
  el.classOverviewRisks.replaceChildren(...(data.risks || []).map((student) => {
    const row = document.createElement('div'); row.className = 'class-overview-row is-risk';
    const title = document.createElement('strong'); title.textContent = student.displayName;
    const meta = document.createElement('span'); meta.textContent = student.risk;
    row.append(title, meta); return row;
  }));
  el.classOverviewRisksEmpty.hidden = (data.risks || []).length > 0;
  el.classOverviewRanking.replaceChildren(...(data.ranking || []).map((student, index) => {
    const row = document.createElement('div'); row.className = 'class-overview-row';
    const title = document.createElement('strong'); title.textContent = `${index + 1}. ${student.displayName}`;
    const meta = document.createElement('span'); meta.textContent = `${student.recentSpeed || 0} 字/分 · ${student.latestAccuracy || 0}%`;
    row.append(title, meta); return row;
  }));
  el.classOverviewRankingEmpty.hidden = (data.ranking || []).length > 0;
}

async function loadClassOverview(item) {
  try { renderClassOverview(await api(`/api/admin/classes/${item.id}/overview`)); }
  catch (error) { toast(error.message, true); }
}

async function removeClassMember(item, member) {
  try {
    await api(`/api/admin/classes/${item.id}/members/${member.id}`, { method: 'DELETE' });
    toast(`${member.displayName} 已移出班级`);
    await loadClasses();
    await loadClassMembers(item);
  } catch (error) { toast(error.message, true); }
}

function resetClassForm() {
  el.classForm.reset(); el.classId.value = '';
  el.classSubmit.innerHTML = '<i data-lucide="plus"></i><span>创建班级</span>';
  el.classCancelEdit.hidden = true; window.lucide?.createIcons();
}

function openClassEdit(item) {
  el.classId.value = item.id; el.className.value = item.name || ''; el.classTerm.value = item.term || ''; el.classDescription.value = item.description || '';
  el.classSubmit.innerHTML = '<i data-lucide="save"></i><span>保存修改</span>'; el.classCancelEdit.hidden = false;
  el.classForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.lucide?.createIcons();
}

async function saveClass(event) {
  event.preventDefault();
  const id = el.classId.value;
  try {
    await api(id ? `/api/admin/classes/${id}` : '/api/admin/classes', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ name: el.className.value, term: el.classTerm.value, description: el.classDescription.value }) });
    resetClassForm(); toast(id ? '班级已更新' : '班级已创建'); await loadClasses();
  } catch (error) { toast(error.message, true); }
}

async function toggleClass(item) {
  try { await api(`/api/admin/classes/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) }); toast(item.isActive ? '班级已停用' : '班级已启用'); await loadClasses(); }
  catch (error) { toast(error.message, true); }
}

async function assignStudents(event) {
  event.preventDefault();
  const classId = el.classTarget.value;
  const studentIds = [...el.classStudents.selectedOptions].map((option) => Number(option.value));
  if (!classId || !studentIds.length) { toast('请选择班级和至少一名学生', true); return; }
  try { const result = await api(`/api/admin/classes/${classId}/members`, { method: 'POST', body: JSON.stringify({ studentIds }) }); toast(`已将 ${result.assigned} 名学生加入班级`); el.classStudents.selectedIndex = -1; await loadClasses(); }
  catch (error) { toast(error.message, true); }
}

function svgNode(name, attributes = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function renderProgressChart(daily) {
  const chart = el.progressChart; chart.replaceChildren();
  if (!daily.length) { const text = svgNode('text', { x: '340', y: '120', 'text-anchor': 'middle', fill: '#718095', 'font-size': '14' }); text.textContent = '暂无可绘制的训练趋势'; chart.append(text); return; }
  const width = 680, height = 240, pad = { left: 46, right: 18, top: 20, bottom: 38 };
  const values = daily.map((item) => Number(item.speed)); const max = Math.max(20, ...values); const min = Math.max(0, Math.min(...values) - 10);
  for (let step = 0; step < 4; step++) {
    const y = pad.top + (height - pad.top - pad.bottom) / 3 * step;
    chart.append(svgNode('line', { x1: pad.left, x2: width - pad.right, y1: y, y2: y, stroke: '#dce6ee', 'stroke-dasharray': '3 4' }));
    const label = svgNode('text', { x: pad.left - 8, y: y + 4, 'text-anchor': 'end', fill: '#718095', 'font-size': '11' }); label.textContent = Math.round(max - (max - min) / 3 * step); chart.append(label);
  }
  const point = (item, index) => ({ x: pad.left + (width - pad.left - pad.right) * (daily.length === 1 ? .5 : index / (daily.length - 1)), y: pad.top + (height - pad.top - pad.bottom) * (1 - (Number(item.speed) - min) / Math.max(1, max - min)) });
  const points = daily.map(point);
  chart.append(svgNode('polyline', { points: points.map((item) => `${item.x},${item.y}`).join(' '), fill: 'none', stroke: '#1f9d61', 'stroke-width': '3', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  points.forEach((item, index) => { chart.append(svgNode('circle', { cx: item.x, cy: item.y, r: '4', fill: '#fff', stroke: '#1f9d61', 'stroke-width': '3' })); if (index === 0 || index === points.length - 1) { const label = svgNode('text', { x: item.x, y: height - 14, 'text-anchor': 'middle', fill: '#718095', 'font-size': '10' }); label.textContent = daily[index].date.slice(5); chart.append(label); } });
}

async function openProgressDialog(item) {
  try {
    const data = await api(`/api/admin/progress/students/${item.id}`);
    const student = data.student;
    el.progressStudentName.textContent = student.displayName;
    el.progressDialogSummary.textContent = `共完成 ${student.sessions} 次训练，实际训练 ${student.activeDays} 天，日均 ${student.dailyHours} 小时；近期速度 ${student.recentSpeed} 字/分，较首次 ${changeText(student.speedChange, ' 字/分')}。`;
    renderProgressChart(data.daily);
    el.progressModeList.replaceChildren(...Object.entries(student.modes).map(([mode, count]) => { const pill = document.createElement('span'); pill.textContent = `${modeLabel(mode)} ${count} 次`; return pill; }));
    el.progressRecentList.replaceChildren(...data.recent.slice(0, 8).map((record) => { const row = document.createElement('div'); row.innerHTML = `<strong>${modeLabel(record.mode)}</strong><span>${record.speed} 字/分 · ${record.accuracy}%</span><small>${formatDate(new Date(record.completedAt).toISOString().replace('T', ' ').slice(0, 19))}</small>`; return row; }));
    el.progressDialog.showModal();
  } catch (error) { toast(error.message, true); }
}

async function toggleUserStatus(item) {
  const action = item.isActive ? '停用' : '启用';
  if (!confirm(`确定${action} ${item.displayName}（${item.username}）的账号吗？`)) return;
  try {
    await api(`/api/admin/users/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) });
    toast(`账号已${action}`);
    await Promise.all([loadUsers(), loadStats()]);
  } catch (error) { toast(error.message, true); }
}

function openPasswordReset(item) {
  el.resetForm.reset();
  el.resetUserId.value = item.id;
  el.resetUserName.textContent = `${item.displayName}（${item.username}）`;
  el.resetError.textContent = '';
  el.resetDialog.showModal();
  setTimeout(() => el.resetPassword.focus(), 0);
}

async function submitPasswordReset(event) {
  event.preventDefault();
  el.resetError.textContent = '';
  if (el.resetPassword.value !== el.resetPasswordConfirm.value) {
    el.resetError.textContent = '两次输入的新密码不一致';
    return;
  }
  try {
    await api(`/api/admin/users/${el.resetUserId.value}/reset-password`, {
      method: 'POST', body: JSON.stringify({ password: el.resetPassword.value })
    });
    el.resetDialog.close();
    toast('密码已重置，该账号需要重新登录');
    await loadUsers();
  } catch (error) { el.resetError.textContent = error.message; }
}

async function deleteScore(item) {
  if (!confirm(`确定删除 ${item.nickname} 的 ${item.score} 字成绩吗？`)) return;
  try {
    await api(`/api/admin/scores/${item.id}`, { method: 'DELETE' });
    toast('成绩已删除');
    await Promise.all([loadScores(), loadStats()]);
  } catch (error) { toast(error.message, true); }
}

async function loadScores() {
  const data = await api(`/api/admin/scores?page=${adminState.page}`);
  adminState.page = data.page;
  adminState.pages = data.pages;
  el.scoreCount.textContent = `共 ${data.total} 条`;
  el.scoreEmpty.hidden = data.rows.length > 0;
  el.scorePagination.hidden = data.total <= data.pageSize;
  el.pageLabel.textContent = `第 ${data.page} / ${data.pages} 页`;
  el.previousPage.disabled = data.page <= 1;
  el.nextPage.disabled = data.page >= data.pages;
  el.scoreTable.replaceChildren(...data.rows.map((item) => {
    const row = document.createElement('tr');
    const nickname = document.createElement('td'); nickname.className = 'student-cell';
    const displayName = document.createElement('strong'); displayName.textContent = item.nickname;
    const username = document.createElement('span'); username.textContent = item.username ? `@${item.username}` : '旧版访客成绩';
    nickname.append(displayName, username);
    const score = document.createElement('td'); score.className = 'score-number'; score.textContent = item.score;
    const accuracy = document.createElement('td'); accuracy.textContent = `${item.accuracy}%`;
    const wrong = document.createElement('td'); wrong.textContent = item.wrongChars;
    const passage = document.createElement('td'); passage.textContent = item.passageTitle || '文章已删除';
    const created = document.createElement('td'); created.textContent = formatDate(item.createdAt);
    const actions = document.createElement('td'); actions.className = 'table-actions'; actions.append(actionButton('trash-2', '删除成绩', 'is-danger', () => deleteScore(item)));
    row.append(nickname, score, accuracy, wrong, passage, created, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

const competitionStatusNames = { draft: '草稿', registration: '检录中', running: '比赛中', paused: '已暂停', finished: '已结束' };
function renderCompetitions() {
  const rows = adminState.competitions;
  el.competitionCount.textContent = `共 ${rows.length} 场`;
  el.competitionEmpty.hidden = rows.length > 0;
  el.competitionTable.replaceChildren(...rows.map((item) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.className = 'article-cell';
    const strong = document.createElement('strong'); strong.textContent = item.name;
    const small = document.createElement('span'); small.textContent = item.id.slice(0, 8); name.append(strong, small);
    const mode = document.createElement('td'); mode.textContent = item.mode === 'speed' ? `个人赛 · ${item.language === 'en' ? '英文' : '中文'}` : item.mode === 'duel' ? '旧版 1v1' : '旧版团队同题赛';
    const status = document.createElement('td');
    const pill = document.createElement('span'); pill.className = `status-pill ${item.status === 'running' ? '' : item.status === 'finished' ? 'is-inactive' : ''}`; pill.textContent = competitionStatusNames[item.status] || item.status; status.append(pill);
    const created = document.createElement('td'); created.textContent = formatDate(item.createdAt);
    const actions = document.createElement('td'); actions.className = 'table-actions';
    if (item.status === 'draft') actions.append(actionButton('clipboard-check', '开启检录', '', () => openCompetitionRegistration(item)));
    if (item.status === 'registration') actions.append(actionButton('play', '开始比赛', '', () => startCompetition(item)));
    if (item.status === 'running') {
      if (item.mode !== 'speed') actions.append(actionButton('skip-forward', '结算本轮或开始下一轮', '', () => advanceCompetition(item)));
      actions.append(actionButton('pause', '暂停赛事', '', () => pauseCompetition(item)));
      if (item.mode !== 'speed') actions.append(actionButton('plus-circle', '本轮加时', '', () => addCompetitionTime(item)));
    }
    if (item.status === 'paused') actions.append(actionButton('play', '继续赛事', '', () => resumeCompetition(item)));
    if (['running', 'paused', 'finished'].includes(item.status)) {
      const boardLink = document.createElement('a'); boardLink.className = 'table-action'; boardLink.href = `/board?competition=${item.id}`; boardLink.target = '_blank'; boardLink.rel = 'noopener'; boardLink.title = '打开大屏'; boardLink.setAttribute('aria-label', '打开大屏'); boardLink.innerHTML = '<i data-lucide="monitor-up"></i>'; actions.append(boardLink);
    }
    if (item.status === 'finished') {
      const exportLink = document.createElement('a'); exportLink.className = 'table-action'; exportLink.href = `/api/competitions/${item.id}/export.csv`; exportLink.title = '导出成绩'; exportLink.setAttribute('aria-label', '导出成绩'); exportLink.innerHTML = '<i data-lucide="download"></i>'; actions.append(exportLink);
      if (item.mode === 'team') actions.append(actionButton('gavel', '确认队伍结果', '', () => decideCompetitionResult(item)));
    }
    for (const action of actions.children) {
      const label = document.createElement('span');
      label.textContent = action.getAttribute('aria-label') || action.title;
      action.append(label);
    }
    row.append(name, mode, status, created, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

async function loadCompetitions() {
  const rows = await api('/api/competitions');
  adminState.competitions = Array.isArray(rows) ? rows : [];
  renderCompetitions();
}

async function loadBattleCompetition() {
  const state = await api('/api/battle/competition/referee');
  el.battleCompetitionStatus.textContent = ({ waiting: '等待选手', countdown: '开赛倒计时', running: '比赛中', finished: '本局已结束' })[state.phase] || state.phase;
  el.battleCompetitionSummary.textContent = state.phase === 'finished'
    ? `红方 ${state.result.red.toFixed(1)}% · 蓝方 ${(100 - state.result.red).toFixed(1)}% · ${state.result.winner ? (state.result.winner === 'red' ? '红方' : '蓝方') + '获胜' : '平局'}`
    : `红方 ${state.teams.red.count} 人 · 蓝方 ${state.teams.blue.count} 人 · ${Math.round(state.durationMs / 1000)} 秒/局${state.article ? ` · 题面「${state.article.preview}…」共 ${state.article.segments} 段` : ''}`;
  el.battleCompetitionStart.disabled = state.phase !== 'waiting' || !state.teams.red.count || !state.teams.blue.count;
  el.battleCompetitionPrepare.disabled = ['countdown', 'running'].includes(state.phase);
  const redNames = state.players.filter((player) => player.team === 'red').map((player) => player.name).join('、') || '暂无';
  const blueNames = state.players.filter((player) => player.team === 'blue').map((player) => player.name).join('、') || '暂无';
  el.battleCompetitionStatus.dataset.phase = state.phase;
  const roster = [['red', '红方阵营', redNames, state.teams.red.count], ['blue', '蓝方阵营', blueNames, state.teams.blue.count]];
  const rosterKey = JSON.stringify(roster);
  if (el.battleCompetitionRoster.dataset.roster === rosterKey) return;
  el.battleCompetitionRoster.dataset.roster = rosterKey;
  el.battleCompetitionRoster.replaceChildren(...roster.map(([team, title, names, count]) => {
    const group = document.createElement('section'); group.className = `competition-side is-${team}`;
    const heading = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = title;
    const total = document.createElement('b'); total.textContent = `${count} 人`;
    heading.append(name, total);
    const players = document.createElement('p'); players.textContent = names === '暂无' ? '等待学生加入阵营' : names;
    group.append(heading, players);
    return group;
  }));
}

async function prepareBattleCompetition() {
  try {
    const current = await api('/api/battle/competition/referee');
    if (current.phase === 'waiting' && current.online > 0 && !window.confirm('新建房间会清空当前已加入选手，确定继续吗？')) return;
    await api('/api/battle/competition/referee/prepare', { method: 'POST', body: JSON.stringify({ durationMs: Number(el.battleCompetitionDuration.value), passageIds: [...battlePoolSelection] }) });
    toast('团队比赛房间已准备，选手可以选择阵营'); await loadBattleCompetition();
  } catch (error) { toast(error.message, true); }
}

async function startBattleCompetition() {
  try {
    await api('/api/battle/competition/referee/start', { method: 'POST' });
    toast('团队比赛已开始'); await loadBattleCompetition();
  } catch (error) { toast(error.message, true); }
}

// ------------------------------------------------------------ 指定文章
//
// 候选项来自后台「练习文章」表（不是代码里写死的题库），按分类分组。
// 个人赛按语言分开存选择（切中/英文时各留各的），团队阵营赛只有中文。

const competitionPoolSelections = { zh: new Set(), en: new Set() };
const battlePoolSelection = new Set();
let textCatalog = [];

function competitionPoolLanguage() {
  return el.competitionMode.value === 'speed-en' ? 'en' : 'zh';
}
function competitionPoolSelection() {
  return competitionPoolSelections[competitionPoolLanguage()];
}

function updatePoolSummary(countEl, selection) {
  const count = selection.size;
  countEl.textContent = count ? `已选 ${count} 篇 · 开赛随机抽一篇` : '未指定 · 自动取题';
}

function renderPoolPicker({ listEl, tipEl, countEl, selection, language }) {
  const rows = textCatalog.filter((item) => item.language === language);
  listEl.replaceChildren();
  const groups = new Map();
  for (const item of rows) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  for (const group of groups.values()) {
    const block = document.createElement('div');
    block.className = 'competition-pool-group';
    const heading = document.createElement('strong');
    heading.textContent = `${group[0].category} · ${group.length} 篇`;
    block.append(heading);
    for (const item of group) {
      const label = document.createElement('label');
      label.className = 'competition-pool-item';
      label.title = item.preview;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = String(item.id);
      box.checked = selection.has(item.id);
      box.addEventListener('change', () => {
        if (box.checked) selection.add(item.id);
        else selection.delete(item.id);
        updatePoolSummary(countEl, selection);
      });
      const preview = document.createElement('span');
      preview.textContent = item.title;
      const length = document.createElement('small');
      length.textContent = `${item.length} 字`;
      label.append(box, preview, length);
      block.append(label);
    }
    listEl.append(block);
  }
  const empty = language === 'en' ? '还没有英文文章，请先到「练习文章」添加' : '还没有文章，请先到「练习文章」添加';
  tipEl.textContent = rows.length ? `共 ${rows.length} 篇可选，点标题可收起` : empty;
  updatePoolSummary(countEl, selection);
}

function renderCompetitionPool() {
  renderPoolPicker({
    listEl: el.competitionPoolList, tipEl: el.competitionPoolTip,
    countEl: el.competitionPoolCount, selection: competitionPoolSelection(), language: competitionPoolLanguage()
  });
}

function renderBattlePool() {
  renderPoolPicker({
    listEl: el.battlePoolList, tipEl: el.battlePoolTip,
    countEl: el.battlePoolCount, selection: battlePoolSelection, language: 'zh'
  });
}

async function loadTextCatalog() {
  try {
    const data = await api('/api/competitions/text-catalog');
    textCatalog = Array.isArray(data.rows) ? data.rows : [];
  } catch (error) {
    textCatalog = [];
    toast(error.message, true);
  }
  renderCompetitionPool();
  renderBattlePool();
}

function updateCompetitionModeFields() {
  const team = el.competitionMode.value === 'team';
  el.competitionTeamFields.forEach((field) => { field.hidden = !team; });
  const league = team && el.competitionSeries.value === 'league';
  el.competitionLeagueFields.forEach((field) => { field.hidden = !league; });
  el.competitionSideA.parentElement.hidden = !team || league;
  el.competitionSideB.parentElement.hidden = !team || league;
  el.competitionSideA.required = team && !league;
  el.competitionSideB.required = team && !league;
  el.competitionSideNames.required = league;
}

async function saveCompetition(event) {
  event.preventDefault();
  try {
    const team = el.competitionMode.value === 'team';
    const speed = el.competitionMode.value.startsWith('speed-');
    const league = team && el.competitionSeries.value === 'league';
    const names = league
      ? el.competitionSideNames.value.split(/[、,，]/).map((name) => name.trim()).filter(Boolean).slice(0, 8)
      : [el.competitionSideA.value.trim(), el.competitionSideB.value.trim()].filter(Boolean);
    if (team && names.length < 2) { toast('请至少填写两个参赛方', true); return; }
    await api('/api/competitions', {
      method: 'POST',
      body: JSON.stringify({
        name: el.competitionName.value.trim(),
        mode: speed ? 'speed' : el.competitionMode.value,
        schedule: el.competitionSchedule.value,
        config: {
          roundMs: Number(el.competitionDuration.value),
          capacity: speed ? 60 : team ? Number(el.competitionTeamSize.value) * names.length : 2,
          ...(speed ? { language: el.competitionMode.value === 'speed-en' ? 'en' : 'zh' } : {}),
          teamSize: Number(el.competitionTeamSize.value),
          series: team ? el.competitionSeries.value : 'single',
          passageIds: [...competitionPoolSelection()]
        },
        sides: team ? names.map((name, index) => ({ name, color: ['#e05b5b', '#4a8fe0', '#3fae74', '#d9a93a', '#8d6fd4', '#dd8442'][index] || '#4a8fe0' })) : []
      })
    });
    el.competitionForm.reset();
    el.competitionDuration.value = '120000';
    updateCompetitionModeFields();
    competitionPoolSelection().clear();
    renderCompetitionPool();
    toast('赛事已创建');
    await loadCompetitions();
  } catch (error) { toast(error.message, true); }
}

async function openCompetitionRegistration(item) {
  try { await api(`/api/competitions/${item.id}/registration`, { method: 'POST' }); toast('检录已开启'); await loadCompetitions(); }
  catch (error) { toast(error.message, true); }
}

async function startCompetition(item) {
  try {
    let body;
    if (item.schedule === 'multi_day') {
      const planned = window.prompt('输入计划开始时间（例如 2026-10-23 14:30），留空则立即开始', '');
      if (planned) {
        const plannedAt = Date.parse(planned.replace(' ', 'T'));
        if (!Number.isFinite(plannedAt)) { toast('计划时间格式不正确', true); return; }
        body = JSON.stringify({ plannedAt });
      }
    }
    await api(`/api/competitions/${item.id}/start`, { method: 'POST', ...(body ? { body } : {}) });
    toast('比赛已开始或已排期'); await loadCompetitions();
  }
  catch (error) { toast(error.message, true); }
}

async function advanceCompetition(item) {
  try {
    const state = await api(`/api/competitions/${item.id}/admin`);
    const path = state.round?.status === 'running' ? 'settle' : 'start';
    let options = { method: 'POST' };
    if (path === 'start' && item.schedule === 'multi_day') {
      const planned = window.prompt('输入下一轮计划开始时间，留空则立即开始', '');
      if (planned) {
        const plannedAt = Date.parse(planned.replace(' ', 'T'));
        if (!Number.isFinite(plannedAt)) { toast('计划时间格式不正确', true); return; }
        options.body = JSON.stringify({ plannedAt });
      }
    }
    await api(`/api/competitions/${item.id}/${path}`, options);
    toast(path === 'settle' ? '本轮已结算' : '下一轮已开始');
    await loadCompetitions();
  } catch (error) { toast(error.message, true); }
}

async function pauseCompetition(item) {
  try { await api(`/api/competitions/${item.id}/pause`, { method: 'POST' }); toast('赛事已暂停'); await loadCompetitions(); }
  catch (error) { toast(error.message, true); }
}

async function resumeCompetition(item) {
  try { await api(`/api/competitions/${item.id}/resume`, { method: 'POST' }); toast('赛事已继续'); await loadCompetitions(); }
  catch (error) { toast(error.message, true); }
}

async function addCompetitionTime(item) {
  const seconds = Number.parseInt(window.prompt('增加多少秒？', '30'), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  try { await api(`/api/competitions/${item.id}/overtime`, { method: 'POST', body: JSON.stringify({ extraMs: seconds * 1000 }) }); toast(`本轮已加时 ${seconds} 秒`); await loadCompetitions(); }
  catch (error) { toast(error.message, true); }
}

async function decideCompetitionResult(item) {
  try {
    const state = await api(`/api/competitions/${item.id}/admin`);
    if (!state.sides?.length || !state.matches?.length) return;
    let match = state.matches.at(-1);
    if (state.matches.length > 1) {
      const matchOptions = state.matches.map((current, index) => `${index + 1}. ${current.sideAName} vs ${current.sideBName}`).join('；');
      const matchIndex = Number.parseInt(window.prompt(`请选择要裁定的场次（${matchOptions}）`, String(state.matches.length)), 10) - 1;
      if (!Number.isInteger(matchIndex) || !state.matches[matchIndex]) return;
      match = state.matches[matchIndex];
    }
    const candidates = [state.sides.find((side) => side.id === match.sideAId), state.sides.find((side) => side.id === match.sideBId)].filter(Boolean);
    const options = candidates.map((side, index) => `${index + 1}. ${side.name}`).join('；');
    const selected = Number.parseInt(window.prompt(`请选择胜方（${options}）`, '1'), 10) - 1;
    if (!Number.isInteger(selected) || !candidates[selected]) return;
    const reason = window.prompt('请输入裁定原因', '现场复核后确认') || '';
    await api(`/api/competitions/${item.id}/result`, { method: 'POST', body: JSON.stringify({ matchId: match.id, winnerSideId: candidates[selected].id, reason }) });
    toast('队伍结果已确认');
    await loadCompetitions();
  } catch (error) { toast(error.message, true); }
}

async function switchView(view) {
  const allowedViews = ['overview', 'admins', 'passages', 'users', 'classes', 'progress', 'assignments', 'competitions', 'scores'];
  if (!allowedViews.includes(view)) view = 'overview';
  adminState.activeView = view;
  try { localStorage.setItem('typing-admin-view', view); } catch { /* private mode */ }
  if (location.hash !== `#${view}`) history.replaceState(null, '', `${location.pathname}${location.search}#${view}`);
  el.navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));
  el.views.forEach((section) => { section.hidden = section.id !== `view-${view}`; });
  el.sidebar.classList.remove('is-open');
  try {
    if (view === 'overview') await Promise.all([loadStats(), loadProgressOverview()]);
    if (view === 'admins') await loadAdminAccounts();
    if (view === 'passages') await loadPassages();
    if (view === 'users') await Promise.all([loadUsers(), loadUserClassFilter()]);
    if (view === 'classes') await loadClasses();
    if (view === 'progress') await loadProgress();
    if (view === 'assignments') await Promise.all([loadAssignments(), loadAssignmentUsers(), loadAssignmentClasses()]);
    if (view === 'competitions') await Promise.all([loadCompetitions(), loadBattleCompetition(), loadTextCatalog()]);
    if (view === 'scores') await loadScores();
  } catch (error) {
    if (error.status === 401) setAuthenticated(false);
    else toast(error.message, true);
  }
}

el.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  el.loginError.textContent = '';
  try {
    const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: el.username.value.trim(), password: el.password.value }) });
    adminState.admin = result.admin || { id: 0, username: el.username.value.trim(), role: 'superadmin' };
    setAuthenticated(true);
    el.username.value = adminState.admin.username;
    el.password.value = '';
    await switchView((location.hash.slice(1) || localStorage.getItem('typing-admin-view') || 'overview'));
  } catch (error) { el.loginError.textContent = error.message; }
});
el.togglePassword.addEventListener('click', () => {
  const showing = el.password.type === 'text';
  el.password.type = showing ? 'password' : 'text';
  el.togglePassword.innerHTML = `<i data-lucide="${showing ? 'eye' : 'eye-off'}"></i>`;
  window.lucide?.createIcons();
});
el.logout.addEventListener('click', async () => { try { await api('/api/admin/logout', { method: 'POST' }); } finally { setAuthenticated(false); } });
el.adminAccountForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await api('/api/admin/admins', { method: 'POST', body: JSON.stringify({
      username: el.adminAccountUsername.value.trim(), displayName: el.adminAccountDisplayName.value.trim(),
      password: el.adminAccountPassword.value, role: el.adminAccountRole.value
    }) });
    toast('管理员已创建'); el.adminAccountForm.reset(); await loadAdminAccounts();
  } catch (error) { toast(error.message, true); }
});
el.navItems.forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
document.querySelectorAll('.jump-button').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.jump)));
el.passageSearch.addEventListener('input', debounce(() => { adminState.passagePage = 1; loadPassages(); }));
el.addPassage.addEventListener('click', () => openPassageDialog());
el.closeDialog.addEventListener('click', () => el.dialog.close());
el.cancelPassage.addEventListener('click', () => el.dialog.close());
el.passageContent.addEventListener('input', () => { el.contentCounter.textContent = `${Array.from(el.passageContent.value).length} / 2000`; });
el.passageForm.addEventListener('submit', savePassage);
el.userSearch.addEventListener('input', debounce(() => { adminState.userPage = 1; loadUsers(); }));
el.userClassFilter.addEventListener('change', () => { adminState.userPage = 1; loadUsers(); });
el.refreshUsers.addEventListener('click', () => { adminState.userPage = 1; loadUsers(); });
el.studentImportSubmit?.addEventListener('click', async () => {
  const text = el.studentImportText.value.trim();
  if (!text) { toast('请先粘贴姓名和学号', true); return; }
  el.studentImportSubmit.disabled = true;
  try {
    const result = await api('/api/admin/users/import', { method: 'POST', body: JSON.stringify({ text }) });
    el.studentImportResult.textContent = `已导入 ${result.imported} 人${result.failed ? `，${result.failed} 行失败` : ''}`;
    if (result.errors?.length) el.studentImportResult.title = result.errors.map((item) => `第 ${item.line} 行：${item.message}`).join('\n');
    toast(result.failed ? '导入完成，请检查失败行' : '学生导入成功', result.failed > 0);
    el.studentImportText.value = '';
    await loadUsers();
  } catch (error) { toast(error.message, true); }
  finally { el.studentImportSubmit.disabled = false; }
});
el.refreshClasses.addEventListener('click', loadClasses);
el.classForm.addEventListener('submit', saveClass);
el.classCancelEdit.addEventListener('click', resetClassForm);
el.classAssignForm.addEventListener('submit', assignStudents);
el.closeClassMembers.addEventListener('click', () => { el.classMembersPanel.hidden = true; });
el.assignmentPreviousPage.addEventListener('click', () => { adminState.assignmentPage -= 1; loadAssignments(); });
el.assignmentNextPage.addEventListener('click', () => { adminState.assignmentPage += 1; loadAssignments(); });
el.classPreviousPage.addEventListener('click', () => { adminState.classPage -= 1; loadClasses(); });
el.classNextPage.addEventListener('click', () => { adminState.classPage += 1; loadClasses(); });
el.unassignedPreviousPage.addEventListener('click', () => { adminState.unassignedPage -= 1; loadClasses(); });
el.unassignedNextPage.addEventListener('click', () => { adminState.unassignedPage += 1; loadClasses(); });
el.classMembersPreviousPage.addEventListener('click', () => { adminState.classMembersPage -= 1; const item = adminState.classes.find((row) => row.id === adminState.classMembersClassId); if (item) loadClassMembers(item); });
el.classMembersNextPage.addEventListener('click', () => { adminState.classMembersPage += 1; const item = adminState.classes.find((row) => row.id === adminState.classMembersClassId); if (item) loadClassMembers(item); });
el.progressSearch.addEventListener('input', debounce(() => { adminState.progressPage = 1; loadProgress(); }));
el.refreshProgress.addEventListener('click', () => { adminState.progressPage = 1; loadProgress(); });
el.closeProgressDialog.addEventListener('click', () => el.progressDialog.close());
el.resetForm.addEventListener('submit', submitPasswordReset);
el.closeReset.addEventListener('click', () => el.resetDialog.close());
el.cancelReset.addEventListener('click', () => el.resetDialog.close());
el.refreshScores.addEventListener('click', loadScores);
el.competitionForm.addEventListener('submit', saveCompetition);
el.battleCompetitionPrepare.addEventListener('click', prepareBattleCompetition);
el.battleCompetitionStart.addEventListener('click', startBattleCompetition);
el.competitionMode.addEventListener('change', () => { updateCompetitionModeFields(); renderCompetitionPool(); });
el.competitionPoolClear.addEventListener('click', () => { competitionPoolSelection().clear(); renderCompetitionPool(); });
el.battlePoolClear.addEventListener('click', () => { battlePoolSelection.clear(); renderBattlePool(); });
el.competitionSeries.addEventListener('change', updateCompetitionModeFields);
el.refreshCompetitions.addEventListener('click', () => Promise.all([loadCompetitions(), loadBattleCompetition()]));
el.passagePreviousPage.addEventListener('click', () => { adminState.passagePage -= 1; loadPassages(); });
el.passageNextPage.addEventListener('click', () => { adminState.passagePage += 1; loadPassages(); });
el.userPreviousPage.addEventListener('click', () => { adminState.userPage -= 1; loadUsers(); });
el.userNextPage.addEventListener('click', () => { adminState.userPage += 1; loadUsers(); });
  el.progressPreviousPage.addEventListener('click', () => { adminState.progressPage -= 1; loadProgress(); });
  el.progressNextPage.addEventListener('click', () => { adminState.progressPage += 1; loadProgress(); });
  el.refreshAssignments.addEventListener('click', loadAssignments);
  el.assignmentForm.addEventListener('submit', saveAssignment);
  el.assignmentAudience.addEventListener('change', () => setAssignmentAudience(el.assignmentAudience.value));
  el.assignmentCancelEdit.addEventListener('click', resetAssignmentForm);
el.previousPage.addEventListener('click', () => { adminState.page -= 1; loadScores(); });
el.nextPage.addEventListener('click', () => { adminState.page += 1; loadScores(); });
el.mobileMenu.addEventListener('click', () => el.sidebar.classList.toggle('is-open'));

window.addEventListener('DOMContentLoaded', async () => {
  window.lucide?.createIcons();
  updateCompetitionModeFields();
  el.currentDate.textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  try {
    const session = await api('/api/admin/me');
    if (!session.authenticated) {
      setAuthenticated(false);
      return;
    }
    adminState.admin = session.admin;
    setAuthenticated(true);
    const remembered = location.hash.slice(1) || localStorage.getItem('typing-admin-view') || 'overview';
    await switchView(remembered);
  } catch {
    setAuthenticated(false);
  }
});
setInterval(() => {
  if (adminState.activeView === 'competitions' && !el.adminShell.hidden) loadBattleCompetition().catch(() => {});
}, 2000);
