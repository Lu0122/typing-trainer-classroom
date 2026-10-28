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
  classes: document.querySelector('#class-table'), classCount: document.querySelector('#class-count'), classEmpty: document.querySelector('#class-empty'), classPagination: document.querySelector('#class-pagination'), classPageLabel: document.querySelector('#class-page-label'), classPreviousPage: document.querySelector('#class-previous-page'), classNextPage: document.querySelector('#class-next-page'), refreshClasses: document.querySelector('#refresh-classes'), classForm: document.querySelector('#class-form'), classId: document.querySelector('#class-id-input'), className: document.querySelector('#class-name-input'), classTerm: document.querySelector('#class-term-input'), classDescription: document.querySelector('#class-description-input'), classSubmit: document.querySelector('#class-submit'), classMembersTitle: document.querySelector('#class-members-title'), classMembersTable: document.querySelector('#class-members-table'), classMembersEmpty: document.querySelector('#class-members-empty'), classMembersPagination: document.querySelector('#class-members-pagination'), classMembersPageLabel: document.querySelector('#class-members-page-label'), classMembersPreviousPage: document.querySelector('#class-members-previous-page'), classMembersNextPage: document.querySelector('#class-members-next-page'), classOverviewContent: document.querySelector('#class-overview-content'), classMetricMembers: document.querySelector('#class-metric-members'), classMetricActive: document.querySelector('#class-metric-active'), classMetricSessions: document.querySelector('#class-metric-sessions'), classMetricMinutes: document.querySelector('#class-metric-minutes'), classMetricSpeed: document.querySelector('#class-metric-speed'), classMetricAccuracy: document.querySelector('#class-metric-accuracy'), classOverviewTasks: document.querySelector('#class-overview-tasks'), classOverviewTasksEmpty: document.querySelector('#class-overview-tasks-empty'), classOverviewRisks: document.querySelector('#class-overview-risks'), classOverviewRisksEmpty: document.querySelector('#class-overview-risks-empty'), classOverviewRanking: document.querySelector('#class-overview-ranking'), classOverviewRankingEmpty: document.querySelector('#class-overview-ranking-empty'), closeClassMembers: document.querySelector('#close-class-members'), unassignedTable: document.querySelector('#unassigned-table'), unassignedCount: document.querySelector('#unassigned-count'), unassignedEmpty: document.querySelector('#unassigned-empty'), unassignedPagination: document.querySelector('#unassigned-pagination'), unassignedPageLabel: document.querySelector('#unassigned-page-label'), unassignedPreviousPage: document.querySelector('#unassigned-previous-page'), unassignedNextPage: document.querySelector('#unassigned-next-page'),
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
el.adminAccountOpen = document.querySelector('#admin-account-open');
el.adminAccountDialog = document.querySelector('#admin-account-dialog');
el.closeAdminAccount = document.querySelector('#close-admin-account');
el.cancelAdminAccount = document.querySelector('#cancel-admin-account');
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

el.passagePreviewDialog = document.querySelector('#passage-preview-dialog');
el.closePassagePreview = document.querySelector('#close-passage-preview');
el.cancelPassagePreview = document.querySelector('#cancel-passage-preview');
el.passagePreviewCategory = document.querySelector('#passage-preview-category');
el.passagePreviewTitle = document.querySelector('#passage-preview-title');
el.passagePreviewMeta = document.querySelector('#passage-preview-meta');
el.passagePreviewBody = document.querySelector('#passage-preview-body');

el.adminAccountPagination = document.querySelector('#admin-account-pagination');
el.adminAccountPageLabel = document.querySelector('#admin-account-page-label');
el.adminAccountPreviousPage = document.querySelector('#admin-account-previous-page');
el.adminAccountNextPage = document.querySelector('#admin-account-next-page');
el.competitionPagination = document.querySelector('#competition-pagination');
el.competitionPageLabel = document.querySelector('#competition-page-label');
el.competitionPreviousPage = document.querySelector('#competition-previous-page');
el.competitionNextPage = document.querySelector('#competition-next-page');
el.competitionTextLength = document.querySelector('#competition-text-length-input');

el.adminAccountSearch = document.querySelector('#admin-account-search');
el.adminAccountRoleFilter = document.querySelector('#admin-account-role-filter');
el.adminAccountStatusFilter = document.querySelector('#admin-account-status-filter');
el.classSearch = document.querySelector('#class-search');
el.classStatusFilter = document.querySelector('#class-status-filter');
el.classTermFilter = document.querySelector('#class-term-filter');
el.classMembersSearch = document.querySelector('#class-members-search');
el.unassignedSearch = document.querySelector('#unassigned-search');
el.assignmentSearch = document.querySelector('#assignment-search');
el.assignmentStatusFilter = document.querySelector('#assignment-status-filter');
el.assignmentModeFilter = document.querySelector('#assignment-mode-filter');
el.competitionSearch = document.querySelector('#competition-search');
el.competitionStatusFilter = document.querySelector('#competition-status-filter');
el.competitionLanguageFilter = document.querySelector('#competition-language-filter');
el.scoreSearch = document.querySelector('#score-search');
el.scoreRangeFilter = document.querySelector('#score-range-filter');
el.scoreCategoryFilter = document.querySelector('#score-category-filter');

el.studentImportOpen = document.querySelector('#student-import-open');
el.studentImportDialog = document.querySelector('#student-import-dialog');
el.closeStudentImport = document.querySelector('#close-student-import');
el.cancelStudentImport = document.querySelector('#cancel-student-import');
el.cancelStudentImportPaste = document.querySelector('#cancel-student-import-paste');
el.importTabExcel = document.querySelector('#import-tab-excel');
el.importTabPaste = document.querySelector('#import-tab-paste');
el.importPanelExcel = document.querySelector('#import-panel-excel');
el.importPanelPaste = document.querySelector('#import-panel-paste');
el.studentImportTemplate = document.querySelector('#student-import-template');
el.studentImportFile = document.querySelector('#student-import-file');
el.studentImportDrop = document.querySelector('#student-import-drop');
el.studentImportFileName = document.querySelector('#student-import-file-name');
el.studentImportPreview = document.querySelector('#student-import-preview');
el.studentImportPasteSubmit = document.querySelector('#student-import-paste-submit');
el.studentImportPasteResult = document.querySelector('#student-import-paste-result');
el.studentImportClass = document.querySelector('#student-import-class');

el.classCreateOpen = document.querySelector('#class-create-open');
el.classDialog = document.querySelector('#class-dialog');
el.classDialogTitle = document.querySelector('#class-dialog-title');
el.closeClassDialog = document.querySelector('#close-class-dialog');
el.cancelClassDialog = document.querySelector('#cancel-class-dialog');
el.classAssignDialog = document.querySelector('#class-assign-dialog');
el.classAssignTitle = document.querySelector('#class-assign-title');
el.closeClassAssign = document.querySelector('#close-class-assign');
el.cancelClassAssign = document.querySelector('#cancel-class-assign');
el.submitClassAssign = document.querySelector('#submit-class-assign');
el.classAssignSearch = document.querySelector('#class-assign-search');
el.classAssignScope = document.querySelector('#class-assign-scope');
el.classAssignSelectAll = document.querySelector('#class-assign-select-all');
el.classAssignClear = document.querySelector('#class-assign-clear');
el.classAssignList = document.querySelector('#class-assign-list');
el.classAssignEmpty = document.querySelector('#class-assign-empty');
el.classAssignResult = document.querySelector('#class-assign-result');
el.classAssignCount = document.querySelector('#class-assign-count');
el.classMembersDialog = document.querySelector('#class-members-dialog');

el.bugReportSearch = document.querySelector('#bug-report-search');
el.bugReportStatusFilter = document.querySelector('#bug-report-status-filter');
el.bugReportPriorityFilter = document.querySelector('#bug-report-priority-filter');
el.bugReportTable = document.querySelector('#bug-report-table');
el.bugReportCount = document.querySelector('#bug-report-count');
el.bugReportEmpty = document.querySelector('#bug-report-empty');
el.bugReportPagination = document.querySelector('#bug-report-pagination');
el.bugReportPageLabel = document.querySelector('#bug-report-page-label');
el.bugReportPreviousPage = document.querySelector('#bug-report-previous-page');
el.bugReportNextPage = document.querySelector('#bug-report-next-page');
el.refreshBugReports = document.querySelector('#refresh-bug-reports');
el.bugReportDialog = document.querySelector('#bug-report-dialog');
el.closeBugReport = document.querySelector('#close-bug-report');
el.cancelBugReport = document.querySelector('#cancel-bug-report');
el.bugReportCode = document.querySelector('#bug-report-code');
el.bugReportTitle = document.querySelector('#bug-report-title');
el.bugReportMeta = document.querySelector('#bug-report-meta');
el.bugReportFields = document.querySelector('#bug-report-fields');
el.bugReportAttachment = document.querySelector('#bug-report-attachment');
el.bugReportStatusSelect = document.querySelector('#bug-report-status-select');
el.saveBugReportStatus = document.querySelector('#save-bug-report-status');

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

// ------------------------------------------------------------ 统一分页
//
// 各列表只提供 load(page)，页码文本、按钮禁用、控件显隐都由这里统一处理。
// 服务端 listPage() 会把越界页码夹回 1..pages，所以删掉最后一页的数据后会自动落回有数据的页。

const pagers = {};

// 每页条数：全局共用一份，记在 localStorage 里，换页面或刷新后保持老师上次的选择。
const PAGE_SIZE_KEY = 'admin-list-page-size';
const PAGE_SIZES = [10, 20, 50];
let listPageSize = (() => {
  const saved = Number(window.localStorage?.getItem(PAGE_SIZE_KEY));
  return PAGE_SIZES.includes(saved) ? saved : PAGE_SIZES[0];
})();

function setListPageSize(size) {
  listPageSize = PAGE_SIZES.includes(Number(size)) ? Number(size) : PAGE_SIZES[0];
  try { window.localStorage?.setItem(PAGE_SIZE_KEY, String(listPageSize)); } catch { /* 隐私模式忽略 */ }
  // 其它列表的分页控件同步显示新条数，切过去时不会再是旧值。
  document.querySelectorAll('.pagination-size').forEach((select) => { select.value = String(listPageSize); });
}

// 只把有值的筛选条件拼进查询串，空字符串 = 不筛选；每页条数始终带上。
function filterQuery(pairs) {
  const query = new URLSearchParams({ pageSize: listPageSize });
  for (const [key, value] of Object.entries(pairs)) {
    if (value !== '' && value !== null && value !== undefined) query.set(key, value);
  }
  return query;
}

function createPager({ pagination, label, previous, next, load }) {
  // 每页条数下拉：所有列表共用同一份设置，改完回到第 1 页。
  const sizeSelect = document.createElement('select');
  sizeSelect.className = 'pagination-size';
  sizeSelect.setAttribute('aria-label', '每页条数');
  for (const size of PAGE_SIZES) sizeSelect.append(new Option(`${size} 条/页`, String(size)));
  sizeSelect.value = String(listPageSize);
  sizeSelect.addEventListener('change', () => {
    setListPageSize(sizeSelect.value);
    load(1);
  });
  pagination.prepend(sizeSelect);

  const pager = {
    page: 1,
    pages: 1,
    total: 0,
    pageSize: listPageSize,
    render(data) {
      pager.page = data.page;
      pager.pages = data.pages;
      pager.total = data.total;
      pager.pageSize = data.pageSize;
      sizeSelect.value = String(listPageSize);
      // 始终显示：即使只有一页也让老师看到「第 1 / 1 页」，不会以为分页没生效。
      pagination.hidden = false;
      label.textContent = `第 ${data.page} / ${data.pages} 页`;
      previous.disabled = data.page <= 1;
      next.disabled = data.page >= data.pages;
    },
    go(page) {
      const target = Math.min(Math.max(1, page), pager.pages);
      if (target === pager.page) return;
      load(target);
    }
  };
  previous.addEventListener('click', () => pager.go(pager.page - 1));
  next.addEventListener('click', () => pager.go(pager.page + 1));
  return pager;
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
  el.adminAccountCount.textContent = `共 ${adminState.adminAccountsTotal ?? rows.length} 个`;
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
async function loadAdminAccounts(page = pagers.admins?.page || 1) {
  const query = filterQuery({
    page,
    q: el.adminAccountSearch.value.trim(),
    role: el.adminAccountRoleFilter.value,
    isActive: el.adminAccountStatusFilter.value
  });
  const data = await api(`/api/admin/admins?${query}`);
  adminState.adminAccounts = data.rows || [];
  adminState.adminAccountsTotal = data.total;
  pagers.admins?.render(data);
  renderAdminAccounts(adminState.adminAccounts);
}

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

async function loadPassages(page = pagers.passages?.page || 1) {
  const query = filterQuery({ page, q: el.passageSearch.value.trim() });
  const data = await api(`/api/admin/passages?${query}`);
  adminState.passages = data.rows;
  adminState.passagePage = data.page; adminState.passagePages = data.pages; adminState.passageTotal = data.total;
  pagers.passages?.render(data);
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

async function loadUsers(page = pagers.users?.page || 1) {
  const query = filterQuery({ page, q: el.userSearch.value.trim(), classId: el.userClassFilter.value });
  const data = await api(`/api/admin/users?${query}`);
  adminState.users = data.rows;
  adminState.userPage = data.page; adminState.userPages = data.pages; adminState.userTotal = data.total;
  pagers.users?.render(data);
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

async function loadProgress(page = pagers.progress?.page || 1) {
  const query = filterQuery({ page, q: el.progressSearch.value.trim() });
  const [overview, students] = await Promise.all([api('/api/admin/progress/overview'), api(`/api/admin/progress/students?${query}`)]);
  renderOverviewCharts(overview);
  adminState.progress = students.rows;
  adminState.progressPage = students.page; adminState.progressPages = students.pages; adminState.progressTotal = students.total;
  el.progressMonitored.textContent = overview.monitoredStudents;
  el.progressImproving.textContent = overview.improvingStudents;
  el.progressSpeedChange.textContent = changeText(overview.averageSpeedChange);
  el.progressWeekSessions.textContent = overview.sessionsLast7Days;
  pagers.progress?.render(students);
  renderProgress();
}

const assignmentModeNames = { all: '所有课程', beginner: '新手入门', 'english-word': '英文单词', 'english-phrase': '英文语句', 'english-article': '英文文章', 'pinyin-syllable': '拼音音节', 'pinyin-word': '拼音词组', 'pinyin-article': '拼音文章' };
function renderAssignments() {
  const rows = adminState.assignments;
  el.assignmentCount.textContent = `共 ${adminState.assignmentTotal || 0} 个`;
  el.assignmentEmpty.hidden = rows.length > 0;
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
async function loadAssignments(page = pagers.assignments?.page || 1) {
  const query = filterQuery({
    page,
    q: el.assignmentSearch.value.trim(),
    isActive: el.assignmentStatusFilter.value,
    mode: el.assignmentModeFilter.value
  });
  const data = await api(`/api/admin/assignments?${query}`);
  adminState.assignments = data.rows || [];
  adminState.assignmentPage = data.page; adminState.assignmentPages = data.pages; adminState.assignmentPageSize = data.pageSize; adminState.assignmentTotal = data.total;
  pagers.assignments?.render(data);
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
    actions.append(
      actionButton('user-plus', '添加学生', '', () => openClassAssign(item)),
      actionButton('users', '查看成员', '', () => loadClassMembers(item)),
      actionButton('pencil', '编辑班级', '', () => openClassEdit(item)),
      actionButton(item.isActive ? 'pause' : 'play', item.isActive ? '停用班级' : '启用班级', item.isActive ? 'is-danger' : '', () => toggleClass(item))
    );
    row.append(title, term, count, status, note, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

function renderUnassignedStudents() {
  const rows = adminState.unassignedStudents;
  el.unassignedCount.textContent = `${adminState.unassignedTotal || 0} 人`;
  el.unassignedEmpty.hidden = rows.length > 0;
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

async function loadClasses(page = pagers.classes?.page || 1, unassignedPage = pagers.unassigned?.page || 1) {
  const classQuery = filterQuery({
    page,
    q: el.classSearch.value.trim(),
    isActive: el.classStatusFilter.value,
    term: el.classTermFilter.value
  });
  const unassignedQuery = filterQuery({ page: unassignedPage, q: el.unassignedSearch.value.trim() });
  const [classes, unassigned] = await Promise.all([
    api(`/api/admin/classes?${classQuery}`),
    api(`/api/admin/classes/unassigned/students?${unassignedQuery}`)
  ]);
  adminState.classes = classes.rows || [];
  adminState.unassignedStudents = unassigned.rows || [];
  adminState.classPage = classes.page; adminState.classPages = classes.pages; adminState.classPageSize = classes.pageSize; adminState.classTotal = classes.total;
  adminState.unassignedPage = unassigned.page; adminState.unassignedPages = unassigned.pages; adminState.unassignedPageSize = unassigned.pageSize; adminState.unassignedTotal = unassigned.total;
  pagers.classes?.render(classes);
  pagers.unassigned?.render(unassigned);
  renderClasses(); renderUnassignedStudents();
}

// 学期下拉从现有班级里去重，不写死值。
async function loadClassTermOptions() {
  try {
    const data = await api('/api/admin/classes?all=true');
    const current = el.classTermFilter.value;
    const terms = [...new Set((data.rows || []).map((row) => row.term).filter(Boolean))].sort();
    el.classTermFilter.replaceChildren(new Option('全部学期', ''), ...terms.map((term) => new Option(term, term)));
    if (terms.includes(current)) el.classTermFilter.value = current;
  } catch { /* 下拉读取失败不影响列表 */ }
}

async function loadClassMembers(item, page) {
  try {
    // 换一个班级就回到第 1 页；同一个班级翻页时保留当前页。
    const target = page ?? (item.id === adminState.classMembersClassId ? (pagers.classMembers?.page || 1) : 1);
    const memberQuery = filterQuery({ page: target, q: el.classMembersSearch.value.trim() });
    const data = await api(`/api/admin/classes/${item.id}/members?${memberQuery}`);
    await loadClassOverview(item);
    adminState.classMembersClassId = item.id; adminState.classMembersPage = data.page; adminState.classMembersPages = data.pages; adminState.classMembersPageSize = data.pageSize; adminState.classMembersTotal = data.total;
    el.classMembersTitle.textContent = `${data.class.name} · 成员`;
    el.classMembersEmpty.hidden = data.rows.length > 0;
    pagers.classMembers?.render(data);
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
    if (!el.classMembersDialog.open) el.classMembersDialog.showModal();
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
  el.classDialogTitle.textContent = '新建班级';
  el.classSubmit.innerHTML = '<i data-lucide="plus"></i><span>创建班级</span>';
  window.lucide?.createIcons();
}

function openClassCreate() {
  resetClassForm();
  el.classDialog.showModal();
  el.className.focus();
}

function openClassEdit(item) {
  resetClassForm();
  el.classId.value = item.id; el.className.value = item.name || ''; el.classTerm.value = item.term || ''; el.classDescription.value = item.description || '';
  el.classDialogTitle.textContent = '编辑班级';
  el.classSubmit.innerHTML = '<i data-lucide="save"></i><span>保存修改</span>';
  el.classDialog.showModal();
  window.lucide?.createIcons();
}

async function saveClass(event) {
  event.preventDefault();
  const id = el.classId.value;
  try {
    await api(id ? `/api/admin/classes/${id}` : '/api/admin/classes', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ name: el.className.value, term: el.classTerm.value, description: el.classDescription.value }) });
    resetClassForm();
    el.classDialog.close();
    toast(id ? '班级已更新' : '班级已创建');
    await Promise.all([loadClasses(), loadClassTermOptions()]);
  } catch (error) { toast(error.message, true); }
}

async function toggleClass(item) {
  try { await api(`/api/admin/classes/${item.id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) }); toast(item.isActive ? '班级已停用' : '班级已启用'); await loadClasses(); }
  catch (error) { toast(error.message, true); }
}

// ------------------------------------------------------------ 分班弹框
//
// 在班级行上点「添加学生」→ 弹框里用复选框勾人，支持搜索、全选、切换「只看未分班 / 全部学生」。

let classAssignTarget = null;
let classAssignCandidates = [];
const classAssignSelection = new Set();

async function loadClassAssignCandidates() {
  if (!classAssignTarget) return;
  const query = filterQuery({ q: el.classAssignSearch.value.trim(), scope: el.classAssignScope.value });
  try {
    const data = await api(`/api/admin/classes/${classAssignTarget.id}/candidates?${query}`);
    classAssignCandidates = data.rows || [];
    // 换搜索词后把已经不可见的勾选清掉，避免"看不见却还在提交"
    const visible = new Set(classAssignCandidates.map((row) => row.id));
    for (const id of [...classAssignSelection]) if (!visible.has(id)) classAssignSelection.delete(id);
    renderClassAssignList();
  } catch (error) { toast(error.message, true); }
}

function renderClassAssignList() {
  el.classAssignList.replaceChildren(...classAssignCandidates.map((student) => {
    const row = document.createElement('label');
    row.className = 'class-assign-item';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = String(student.id);
    box.checked = classAssignSelection.has(student.id);
    box.addEventListener('change', () => {
      if (box.checked) classAssignSelection.add(student.id);
      else classAssignSelection.delete(student.id);
      updateClassAssignCount();
    });
    const name = document.createElement('strong'); name.textContent = student.displayName;
    const meta = document.createElement('small'); meta.textContent = `@${student.username}`;
    row.append(box, name, meta);
    if (student.className) {
      const tag = document.createElement('span'); tag.className = 'class-assign-tag'; tag.textContent = `现在 ${student.className}`;
      row.append(tag);
    }
    return row;
  }));
  el.classAssignEmpty.hidden = classAssignCandidates.length > 0;
  updateClassAssignCount();
}

function updateClassAssignCount() {
  el.classAssignCount.textContent = `已选 ${classAssignSelection.size} 人`;
}

function openClassAssign(item) {
  classAssignTarget = item;
  classAssignCandidates = [];
  classAssignSelection.clear();
  el.classAssignSearch.value = '';
  el.classAssignScope.value = 'unassigned';
  el.classAssignResult.textContent = '';
  el.classAssignResult.classList.remove('is-error');
  el.classAssignTitle.textContent = `加入「${item.name}」`;
  el.classAssignList.replaceChildren();
  el.classAssignCount.textContent = '已选 0 人';
  el.classAssignDialog.showModal();
  window.lucide?.createIcons();
  loadClassAssignCandidates();
}

async function submitClassAssign() {
  if (!classAssignTarget || !classAssignSelection.size) { toast('请至少勾选一名学生', true); return; }
  el.submitClassAssign.disabled = true;
  try {
    const result = await api(`/api/admin/classes/${classAssignTarget.id}/members`, {
      method: 'POST',
      body: JSON.stringify({ studentIds: [...classAssignSelection] })
    });
    toast(`已将 ${result.assigned} 名学生加入班级`);
    el.classAssignDialog.close();
    await loadClasses();
  } catch (error) {
    el.classAssignResult.textContent = error.message;
    el.classAssignResult.classList.add('is-error');
    toast(error.message, true);
  } finally {
    el.submitClassAssign.disabled = false;
  }
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

async function loadScores(page = pagers.scores?.page || 1) {
  const query = filterQuery({
    page,
    q: el.scoreSearch.value.trim(),
    range: el.scoreRangeFilter.value,
    category: el.scoreCategoryFilter.value
  });
  const data = await api(`/api/admin/scores?${query}`);
  adminState.page = data.page;
  adminState.pages = data.pages;
  el.scoreCount.textContent = `共 ${data.total} 条`;
  el.scoreEmpty.hidden = data.rows.length > 0;
  pagers.scores?.render(data);
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
  el.competitionCount.textContent = `共 ${adminState.competitionTotal || rows.length} 场`;
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

async function loadScoreCategories() {
  try {
    const data = await api('/api/admin/score-categories');
    const current = el.scoreCategoryFilter.value;
    const categories = data.categories || [];
    el.scoreCategoryFilter.replaceChildren(new Option('全部分类', ''), ...categories.map((category) => new Option(category, category)));
    if (categories.includes(current)) el.scoreCategoryFilter.value = current;
  } catch { /* 分类读取失败不影响列表 */ }
}

async function loadCompetitions(page = pagers.competitions?.page || 1) {
  const query = filterQuery({
    page,
    q: el.competitionSearch.value.trim(),
    status: el.competitionStatusFilter.value,
    language: el.competitionLanguageFilter.value
  });
  const data = await api(`/api/competitions?${query}`);
  adminState.competitions = data.rows || [];
  adminState.competitionTotal = data.total;
  pagers.competitions?.render(data);
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

function openPassagePreview(item) {
  el.passagePreviewCategory.textContent = item.category;
  el.passagePreviewTitle.textContent = item.title;
  el.passagePreviewMeta.textContent = `${item.length} 字 · ${item.language === 'en' ? '英文' : '中文'}`;
  el.passagePreviewBody.textContent = item.content || item.preview || '';
  el.passagePreviewDialog.showModal();
  window.lucide?.createIcons();
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
      const row = document.createElement('div');
      row.className = 'competition-pool-item';
      row.title = item.preview;
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
      const peek = document.createElement('button');
      peek.type = 'button';
      peek.className = 'pool-peek';
      peek.textContent = '全文';
      peek.setAttribute('aria-label', `查看《${item.title}》全文`);
      peek.addEventListener('click', (event) => {
        event.stopPropagation();
        openPassagePreview(item);
      });
      // 点标题/字数也能勾选，但点复选框和「全文」不重复切换。
      row.addEventListener('click', (event) => {
        if (event.target === box || event.target.closest('.pool-peek')) return;
        box.checked = !box.checked;
        box.dispatchEvent(new Event('change'));
      });
      row.append(box, preview, length, peek);
      block.append(row);
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
          textMinLength: el.competitionTextLength.value ? Number(el.competitionTextLength.value) : undefined,
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

// ------------------------------------------------------------ 意见反馈

const BUG_STATUS_CLASS = { 待处理: 'is-pending', 处理中: 'is-running', 已处理: 'is-done' };

async function loadBugReports(page = pagers.bugReports?.page || 1) {
  const query = filterQuery({
    page,
    q: el.bugReportSearch.value.trim(),
    status: el.bugReportStatusFilter.value,
    priority: el.bugReportPriorityFilter.value
  });
  const data = await api(`/api/admin/bug-reports?${query}`);
  adminState.bugReports = data.rows || [];
  el.bugReportCount.textContent = `共 ${data.total} 条`;
  el.bugReportEmpty.hidden = adminState.bugReports.length > 0;
  pagers.bugReports?.render(data);
  renderBugReports();
}

function renderBugReports() {
  el.bugReportTable.replaceChildren(...adminState.bugReports.map((item) => {
    const row = document.createElement('tr');
    const title = document.createElement('td'); title.className = 'article-cell';
    const strong = document.createElement('strong'); strong.textContent = item.title;
    const code = document.createElement('span'); code.textContent = `BUG-${String(item.id).padStart(5, '0')}`;
    title.append(strong, code);
    const student = document.createElement('td'); student.textContent = item.displayName;
    const priority = document.createElement('td');
    const chip = document.createElement('span');
    chip.className = `bug-priority is-${String(item.priority || 'p2').toLowerCase()}`;
    chip.textContent = item.priority;
    priority.append(chip);
    const status = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `status-pill ${BUG_STATUS_CLASS[item.status] || ''}`;
    pill.textContent = item.status;
    status.append(pill);
    const created = document.createElement('td'); created.textContent = formatDate(item.createdAt);
    const attachment = document.createElement('td'); attachment.textContent = item.hasAttachment ? '有附件' : '—';
    const actions = document.createElement('td'); actions.className = 'table-actions';
    actions.append(actionButton('eye', '查看详情', '', () => openBugReport(item)));
    row.append(title, student, priority, status, created, attachment, actions);
    return row;
  }));
  window.lucide?.createIcons();
}

function openBugReport(item) {
  el.bugReportCode.textContent = `BUG-${String(item.id).padStart(5, '0')}`;
  el.bugReportTitle.textContent = item.title;
  el.bugReportMeta.textContent = [item.displayName, formatDate(item.createdAt), `${item.priority} · ${item.frequency}`].filter(Boolean).join(' · ');
  const fields = [
    ['前置条件', item.preconditions],
    ['复现步骤', item.steps],
    ['测试数据', item.testData],
    ['预期结果', item.expectedResult],
    ['实际结果', item.actualResult],
    ['运行环境', item.environment]
  ].filter(([, value]) => String(value || '').trim());
  el.bugReportFields.replaceChildren(...fields.map(([label, value]) => {
    const block = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = label;
    const text = document.createElement('p'); text.textContent = value;
    block.append(name, text);
    return block;
  }));
  if (item.hasAttachment) {
    const link = document.createElement('a');
    link.href = `/api/admin/bug-reports/${item.id}/attachment`;
    link.className = 'secondary-button';
    link.textContent = '下载附件';
    el.bugReportAttachment.replaceChildren(link);
    el.bugReportAttachment.hidden = false;
  } else {
    el.bugReportAttachment.replaceChildren();
    el.bugReportAttachment.hidden = true;
  }
  el.bugReportStatusSelect.value = item.status;
  el.bugReportDialog.dataset.id = String(item.id);
  el.bugReportDialog.showModal();
  window.lucide?.createIcons();
}

async function switchView(view) {
  const allowedViews = ['overview', 'admins', 'passages', 'users', 'classes', 'progress', 'assignments', 'competitions', 'scores', 'bug-reports'];
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
    if (view === 'classes') await Promise.all([loadClasses(), loadClassTermOptions()]);
    if (view === 'progress') await loadProgress();
    if (view === 'assignments') await Promise.all([loadAssignments(), loadAssignmentUsers(), loadAssignmentClasses()]);
    if (view === 'competitions') await Promise.all([loadCompetitions(), loadBattleCompetition(), loadTextCatalog()]);
    if (view === 'scores') await Promise.all([loadScores(), loadScoreCategories()]);
    if (view === 'bug-reports') await loadBugReports();
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
    toast('管理员已创建');
    el.adminAccountForm.reset();
    el.adminAccountDialog.close();
    await loadAdminAccounts();
  } catch (error) { toast(error.message, true); }
});
el.adminAccountOpen?.addEventListener('click', () => {
  el.adminAccountForm.reset();
  el.adminAccountDialog.showModal();
  window.lucide?.createIcons();
});
el.closeAdminAccount?.addEventListener('click', () => el.adminAccountDialog.close());
el.cancelAdminAccount?.addEventListener('click', () => el.adminAccountDialog.close());
el.navItems.forEach((item) => item.addEventListener('click', () => switchView(item.dataset.view)));
document.querySelectorAll('.jump-button').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.jump)));
el.passageSearch.addEventListener('input', debounce(() => loadPassages(1)));
el.addPassage.addEventListener('click', () => openPassageDialog());
el.closeDialog.addEventListener('click', () => el.dialog.close());
el.cancelPassage.addEventListener('click', () => el.dialog.close());
el.passageContent.addEventListener('input', () => { el.contentCounter.textContent = `${Array.from(el.passageContent.value).length} / 2000`; });
el.passageForm.addEventListener('submit', savePassage);
el.userSearch.addEventListener('input', debounce(() => loadUsers(1)));
el.userClassFilter.addEventListener('change', () => loadUsers(1));
el.refreshUsers.addEventListener('click', () => loadUsers(1));
// ------------------------------------------------------------ 学生导入（弹框）
//
// 两种方式：Excel 上传（前端解析成 rows，走 /api/admin/users/import 的 rows 分支）
// 和粘贴文本（直接交给后端的 text 分支，分隔符由后端兼容）。

let studentImportRows = [];

function switchImportTab(tab) {
  const excel = tab !== 'paste';
  el.importTabExcel.classList.toggle('is-active', excel);
  el.importTabPaste.classList.toggle('is-active', !excel);
  el.importTabExcel.setAttribute('aria-selected', String(excel));
  el.importTabPaste.setAttribute('aria-selected', String(!excel));
  el.importPanelExcel.hidden = !excel;
  el.importPanelPaste.hidden = excel;
}

function openStudentImportDialog() {
  studentImportRows = [];
  el.studentImportFile.value = '';
  el.studentImportFileName.textContent = '点击选择 Excel，或把文件拖到这里';
  el.studentImportPreview.replaceChildren();
  el.studentImportPreview.hidden = true;
  el.studentImportResult.textContent = '还没有选择文件。';
  el.studentImportResult.classList.remove('is-error');
  el.studentImportSubmit.disabled = true;
  el.studentImportText.value = '';
  el.studentImportPasteResult.textContent = '';
  el.studentImportPasteResult.classList.remove('is-error');
  switchImportTab('excel');
  el.studentImportDialog.showModal();
  window.lucide?.createIcons();
  loadStudentImportClasses();
}

// 班级下拉：只列启用中的班级，保留上次选择。
async function loadStudentImportClasses() {
  const current = el.studentImportClass.value;
  try {
    const data = await api('/api/admin/classes?all=true');
    const options = (data.rows || []).filter((item) => item.isActive);
    el.studentImportClass.replaceChildren(
      new Option('暂不分班', ''),
      ...options.map((item) => new Option(item.term ? `${item.name} · ${item.term}` : item.name, String(item.id)))
    );
    if ([...el.studentImportClass.options].some((option) => option.value === current)) el.studentImportClass.value = current;
  } catch {
    el.studentImportClass.replaceChildren(new Option('暂不分班', ''));
  }
}

// 表头按关键字认（姓名/名字、学号/账号/用户名）；认不出就按「第一列姓名、第二列学号」读。
function parseStudentSheet(buffer) {
  if (!window.XLSX) throw new Error('表格组件未加载，请刷新页面重试');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('文件里没有工作表');
  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
  if (!matrix.length) throw new Error('表格是空的');
  const header = matrix[0].map((cell) => String(cell ?? '').trim());
  const nameIndex = header.findIndex((cell) => /姓名|名字/.test(cell));
  const idIndex = header.findIndex((cell) => /学号|账号|用户名|登录名/.test(cell));
  const hasHeader = nameIndex >= 0 && idIndex >= 0;
  const body = hasHeader ? matrix.slice(1) : matrix;
  const rows = body.map((line) => ({
    displayName: String(line[hasHeader ? nameIndex : 0] ?? '').trim(),
    studentId: String(line[hasHeader ? idIndex : 1] ?? '').trim()
  })).filter((row) => row.displayName || row.studentId);
  if (!rows.length) throw new Error(hasHeader ? '表格里没有数据行' : '没读到数据，请下载模板后按「姓名」「学号」两列填写');
  if (!hasHeader && rows.some((row) => !row.displayName || !row.studentId)) {
    throw new Error('表格需要「姓名」「学号」两列，请下载模板后填写');
  }
  return rows;
}

function renderStudentImportPreview() {
  el.studentImportPreview.replaceChildren();
  if (!studentImportRows.length) { el.studentImportPreview.hidden = true; return; }
  const head = document.createElement('p');
  head.textContent = `共读到 ${studentImportRows.length} 行，下面是前 5 行：`;
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['姓名', '学号']) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.append(th);
  }
  thead.append(headRow);
  const tbody = document.createElement('tbody');
  for (const row of studentImportRows.slice(0, 5)) {
    const tr = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = row.displayName || '（空）';
    const id = document.createElement('td'); id.textContent = row.studentId || '（空）';
    tr.append(name, id);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  el.studentImportPreview.append(head, table);
  el.studentImportPreview.hidden = false;
}

async function handleStudentImportFile(file) {
  if (!file) return;
  el.studentImportFileName.textContent = file.name;
  el.studentImportResult.classList.remove('is-error');
  el.studentImportResult.textContent = '正在读取…';
  studentImportRows = [];
  el.studentImportSubmit.disabled = true;
  try {
    studentImportRows = parseStudentSheet(await file.arrayBuffer());
    renderStudentImportPreview();
    el.studentImportResult.textContent = `已读取 ${studentImportRows.length} 行，确认无误后点「导入学生」。`;
    el.studentImportSubmit.disabled = false;
  } catch (error) {
    renderStudentImportPreview();
    el.studentImportResult.textContent = error.message;
    el.studentImportResult.classList.add('is-error');
  }
}

function showImportResult(resultEl, result) {
  resultEl.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = `已导入 ${result.imported} 人${result.className ? `，已加入「${result.className}」` : ''}${result.failed ? `，${result.failed} 行失败` : ''}`;
  resultEl.append(summary);
  resultEl.classList.toggle('is-error', result.failed > 0);
  if (result.errors?.length) {
    const list = document.createElement('ul');
    list.className = 'import-error-list';
    for (const item of result.errors.slice(0, 8)) {
      const li = document.createElement('li');
      li.textContent = `第 ${item.line} 行：${item.message}`;
      list.append(li);
    }
    resultEl.append(list);
  }
}

function downloadStudentImportTemplate() {
  if (!window.XLSX) { toast('表格组件未加载，请刷新页面重试', true); return; }
  const workbook = XLSX.utils.book_new();
  const list = XLSX.utils.aoa_to_sheet([['姓名', '学号']]);
  list['!cols'] = [{ wch: 16 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(workbook, list, '学生名单');
  const guide = XLSX.utils.aoa_to_sheet([
    ['填写说明'],
    ['1. 在「学生名单」工作表里，从第 2 行开始填写，每行一个学生。'],
    ['2. A 列填姓名（2-12 个字），B 列填学号（4-32 位字母、数字、下划线或短横线）。'],
    ['3. 导入后学生用姓名登录，初始密码就是学号。'],
    ['4. 姓名不能重复；已存在的姓名会被跳过，并在导入结果里提示行号。'],
    ['5. 单次最多导入 2000 人。'],
    [],
    ['示例（只作参照，不要填进「学生名单」）'],
    ['姓名', '学号'],
    ['张三', '20250101'],
    ['李四', '20250102']
  ]);
  guide['!cols'] = [{ wch: 72 }];
  XLSX.utils.book_append_sheet(workbook, guide, '填写说明');
  XLSX.writeFile(workbook, '学生导入模板.xlsx');
}

el.studentImportOpen.addEventListener('click', openStudentImportDialog);
el.closeStudentImport.addEventListener('click', () => el.studentImportDialog.close());
el.cancelStudentImport.addEventListener('click', () => el.studentImportDialog.close());
el.cancelStudentImportPaste.addEventListener('click', () => el.studentImportDialog.close());
el.importTabExcel.addEventListener('click', () => switchImportTab('excel'));
el.importTabPaste.addEventListener('click', () => switchImportTab('paste'));
el.studentImportTemplate.addEventListener('click', downloadStudentImportTemplate);
el.studentImportFile.addEventListener('change', () => handleStudentImportFile(el.studentImportFile.files?.[0]));
['dragenter', 'dragover'].forEach((type) => el.studentImportDrop.addEventListener(type, (event) => {
  event.preventDefault();
  el.studentImportDrop.classList.add('is-dragging');
}));
el.studentImportDrop.addEventListener('dragleave', () => el.studentImportDrop.classList.remove('is-dragging'));
el.studentImportDrop.addEventListener('drop', (event) => {
  event.preventDefault();
  el.studentImportDrop.classList.remove('is-dragging');
  handleStudentImportFile(event.dataTransfer?.files?.[0]);
});

el.studentImportSubmit.addEventListener('click', async () => {
  if (!studentImportRows.length) return;
  el.studentImportSubmit.disabled = true;
  try {
    const result = await api('/api/admin/users/import', { method: 'POST', body: JSON.stringify({ rows: studentImportRows, classId: el.studentImportClass.value || undefined }) });
    showImportResult(el.studentImportResult, result);
    toast(result.failed ? '导入完成，请检查失败行' : '学生导入成功', result.failed > 0);
    await loadUsers();
    if (!result.failed) el.studentImportDialog.close();
  } catch (error) {
    el.studentImportResult.textContent = error.message;
    el.studentImportResult.classList.add('is-error');
    toast(error.message, true);
  } finally {
    el.studentImportSubmit.disabled = false;
  }
});

el.studentImportPasteSubmit.addEventListener('click', async () => {
  const text = el.studentImportText.value.trim();
  if (!text) {
    el.studentImportPasteResult.textContent = '请先粘贴姓名和学号';
    el.studentImportPasteResult.classList.add('is-error');
    return;
  }
  el.studentImportPasteSubmit.disabled = true;
  try {
    const result = await api('/api/admin/users/import', { method: 'POST', body: JSON.stringify({ text, classId: el.studentImportClass.value || undefined }) });
    showImportResult(el.studentImportPasteResult, result);
    toast(result.failed ? '导入完成，请检查失败行' : '学生导入成功', result.failed > 0);
    el.studentImportText.value = '';
    await loadUsers();
    if (!result.failed) el.studentImportDialog.close();
  } catch (error) {
    el.studentImportPasteResult.textContent = error.message;
    el.studentImportPasteResult.classList.add('is-error');
    toast(error.message, true);
  } finally {
    el.studentImportPasteSubmit.disabled = false;
  }
});
el.refreshClasses.addEventListener('click', () => loadClasses(1, 1));
el.classForm.addEventListener('submit', saveClass);
el.classCreateOpen.addEventListener('click', openClassCreate);
el.closeClassDialog.addEventListener('click', () => { resetClassForm(); el.classDialog.close(); });
el.cancelClassDialog.addEventListener('click', () => { resetClassForm(); el.classDialog.close(); });
el.closeClassAssign.addEventListener('click', () => el.classAssignDialog.close());
el.cancelClassAssign.addEventListener('click', () => el.classAssignDialog.close());
el.submitClassAssign.addEventListener('click', submitClassAssign);
el.classAssignSearch.addEventListener('input', debounce(loadClassAssignCandidates));
el.classAssignScope.addEventListener('change', loadClassAssignCandidates);
el.classAssignSelectAll.addEventListener('click', () => {
  for (const row of classAssignCandidates) classAssignSelection.add(row.id);
  renderClassAssignList();
});
el.classAssignClear.addEventListener('click', () => {
  classAssignSelection.clear();
  renderClassAssignList();
});
el.closeClassMembers.addEventListener('click', () => el.classMembersDialog.close());
el.progressSearch.addEventListener('input', debounce(() => loadProgress(1)));
el.refreshProgress.addEventListener('click', () => loadProgress(1));
el.closeProgressDialog.addEventListener('click', () => el.progressDialog.close());
el.resetForm.addEventListener('submit', submitPasswordReset);
el.closeReset.addEventListener('click', () => el.resetDialog.close());
el.cancelReset.addEventListener('click', () => el.resetDialog.close());
el.refreshScores.addEventListener('click', () => loadScores(1));
el.competitionForm.addEventListener('submit', saveCompetition);
el.battleCompetitionPrepare.addEventListener('click', prepareBattleCompetition);
el.battleCompetitionStart.addEventListener('click', startBattleCompetition);
el.competitionMode.addEventListener('change', () => { updateCompetitionModeFields(); renderCompetitionPool(); });
el.competitionPoolClear.addEventListener('click', () => { competitionPoolSelection().clear(); renderCompetitionPool(); });
el.battlePoolClear.addEventListener('click', () => { battlePoolSelection.clear(); renderBattlePool(); });
el.closePassagePreview.addEventListener('click', () => el.passagePreviewDialog.close());
el.cancelPassagePreview.addEventListener('click', () => el.passagePreviewDialog.close());
el.competitionSeries.addEventListener('change', updateCompetitionModeFields);
el.refreshCompetitions.addEventListener('click', () => Promise.all([loadCompetitions(1), loadBattleCompetition()]));
el.refreshAssignments.addEventListener('click', () => loadAssignments(1));
el.assignmentForm.addEventListener('submit', saveAssignment);
el.assignmentAudience.addEventListener('change', () => setAssignmentAudience(el.assignmentAudience.value));
el.assignmentCancelEdit.addEventListener('click', resetAssignmentForm);

// 所有列表的分页控件在这里一次性接上；各页只提供 load(page)，翻页与按钮状态由 createPager 统一处理。
pagers.passages = createPager({ pagination: el.passagePagination, label: el.passagePageLabel, previous: el.passagePreviousPage, next: el.passageNextPage, load: (page) => loadPassages(page) });
pagers.users = createPager({ pagination: el.userPagination, label: el.userPageLabel, previous: el.userPreviousPage, next: el.userNextPage, load: (page) => loadUsers(page) });
pagers.progress = createPager({ pagination: el.progressPagination, label: el.progressPageLabel, previous: el.progressPreviousPage, next: el.progressNextPage, load: (page) => loadProgress(page) });
pagers.assignments = createPager({ pagination: el.assignmentPagination, label: el.assignmentPageLabel, previous: el.assignmentPreviousPage, next: el.assignmentNextPage, load: (page) => loadAssignments(page) });
pagers.classes = createPager({ pagination: el.classPagination, label: el.classPageLabel, previous: el.classPreviousPage, next: el.classNextPage, load: (page) => loadClasses(page, pagers.unassigned?.page || 1) });
pagers.unassigned = createPager({ pagination: el.unassignedPagination, label: el.unassignedPageLabel, previous: el.unassignedPreviousPage, next: el.unassignedNextPage, load: (page) => loadClasses(pagers.classes?.page || 1, page) });
pagers.classMembers = createPager({
  pagination: el.classMembersPagination, label: el.classMembersPageLabel,
  previous: el.classMembersPreviousPage, next: el.classMembersNextPage,
  load: (page) => {
    const item = adminState.classes.find((row) => row.id === adminState.classMembersClassId);
    if (item) loadClassMembers(item, page);
  }
});
pagers.scores = createPager({ pagination: el.scorePagination, label: el.pageLabel, previous: el.previousPage, next: el.nextPage, load: (page) => loadScores(page) });
pagers.competitions = createPager({ pagination: el.competitionPagination, label: el.competitionPageLabel, previous: el.competitionPreviousPage, next: el.competitionNextPage, load: (page) => loadCompetitions(page) });
pagers.admins = createPager({ pagination: el.adminAccountPagination, label: el.adminAccountPageLabel, previous: el.adminAccountPreviousPage, next: el.adminAccountNextPage, load: (page) => loadAdminAccounts(page) });

// 筛选条件变更一律回到第 1 页，否则会出现「筛选后停在第 3 页但只有 1 页数据」的空列表。
el.adminAccountSearch.addEventListener('input', debounce(() => loadAdminAccounts(1)));
el.adminAccountRoleFilter.addEventListener('change', () => loadAdminAccounts(1));
el.adminAccountStatusFilter.addEventListener('change', () => loadAdminAccounts(1));
el.classSearch.addEventListener('input', debounce(() => loadClasses(1, pagers.unassigned?.page || 1)));
el.classStatusFilter.addEventListener('change', () => loadClasses(1, pagers.unassigned?.page || 1));
el.classTermFilter.addEventListener('change', () => loadClasses(1, pagers.unassigned?.page || 1));
el.unassignedSearch.addEventListener('input', debounce(() => loadClasses(pagers.classes?.page || 1, 1)));
el.classMembersSearch.addEventListener('input', debounce(() => {
  const item = adminState.classes.find((row) => row.id === adminState.classMembersClassId);
  if (item) loadClassMembers(item, 1);
}));
el.assignmentSearch.addEventListener('input', debounce(() => loadAssignments(1)));
el.assignmentStatusFilter.addEventListener('change', () => loadAssignments(1));
el.assignmentModeFilter.addEventListener('change', () => loadAssignments(1));
el.competitionSearch.addEventListener('input', debounce(() => loadCompetitions(1)));
el.competitionStatusFilter.addEventListener('change', () => loadCompetitions(1));
el.competitionLanguageFilter.addEventListener('change', () => loadCompetitions(1));
el.scoreSearch.addEventListener('input', debounce(() => loadScores(1)));
el.scoreRangeFilter.addEventListener('change', () => loadScores(1));
el.scoreCategoryFilter.addEventListener('change', () => loadScores(1));
pagers.bugReports = createPager({ pagination: el.bugReportPagination, label: el.bugReportPageLabel, previous: el.bugReportPreviousPage, next: el.bugReportNextPage, load: (page) => loadBugReports(page) });
el.bugReportSearch.addEventListener('input', debounce(() => loadBugReports(1)));
el.bugReportStatusFilter.addEventListener('change', () => loadBugReports(1));
el.bugReportPriorityFilter.addEventListener('change', () => loadBugReports(1));
el.refreshBugReports.addEventListener('click', () => loadBugReports(1));
el.closeBugReport.addEventListener('click', () => el.bugReportDialog.close());
el.cancelBugReport.addEventListener('click', () => el.bugReportDialog.close());
el.saveBugReportStatus.addEventListener('click', async () => {
  const id = el.bugReportDialog.dataset.id;
  if (!id) return;
  el.saveBugReportStatus.disabled = true;
  try {
    await api(`/api/admin/bug-reports/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: el.bugReportStatusSelect.value }) });
    toast('反馈状态已更新');
    el.bugReportDialog.close();
    await loadBugReports();
  } catch (error) { toast(error.message, true); }
  finally { el.saveBugReportStatus.disabled = false; }
});
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
