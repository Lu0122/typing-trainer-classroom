const state = {
  mode: 'practice',
  passage: null,
  startedAt: null,
  composing: false,
  challenge: null,
  timer: null,
  metricTimer: null,
  practiceCompleted: false,
  user: null,
  authView: 'login',
  pendingChallengeStart: false,
  fingerStep: 'position',
  drillLevel: 'home',
  drillSequence: [],
  drillIndex: 0,
  drillCorrect: 0,
  drillWrong: 0,
  drillStreak: 0,
  drillRound: 0,
  leaderboardPeriod: 'all',
  practiceCategory: null
};

const ACTIVE_CHALLENGE_KEY = 'typingActiveChallenge';

const elements = {
  homeView: document.querySelector('#home-view'),
  homeCards: document.querySelectorAll('.home-card'),
  modeButtons: document.querySelectorAll('.mode-button'),
  modeEyebrow: document.querySelector('#mode-eyebrow'),
  modeTitle: document.querySelector('#mode-title'),
  practiceTools: document.querySelector('#practice-tools'),
  category: document.querySelector('#category-select'),
  nextPassage: document.querySelector('#next-passage'),
  raceIntro: document.querySelector('#race-intro'),
  typingWorkspace: document.querySelector('#typing-workspace'),
  challengeAccount: document.querySelector('#challenge-account'),
  challengeAccountName: document.querySelector('#challenge-account-name'),
  startChallenge: document.querySelector('#start-challenge'),
  startChallengeIcon: document.querySelector('#start-challenge-icon'),
  startChallengeLabel: document.querySelector('#start-challenge-label'),
  challengeTimer: document.querySelector('#challenge-timer'),
  fingerWorkspace: document.querySelector('#finger-workspace'),
  virtualKeyboardPanel: document.querySelector('#virtual-keyboard-panel'),
  fingerStepButtons: document.querySelectorAll('.finger-step'),
  courseTabs: document.querySelectorAll('.course-tab'),
  fingerCourseBack: document.querySelector('#finger-course-back'),
  fingerCourseSelect: document.querySelector('#finger-course-select'),
  fingerPositionPanel: document.querySelector('#finger-position-panel'),
  fingerDrillPanel: document.querySelector('#finger-drill-panel'),
  fingerStartDrill: document.querySelector('#finger-start-drill'),
  drillLevels: document.querySelectorAll('.drill-level'),
  drillNextKey: document.querySelector('#drill-next-key'),
  drillFingerHint: document.querySelector('#drill-finger-hint'),
  drillSequence: document.querySelector('#drill-sequence'),
  drillProgressFill: document.querySelector('#drill-progress-fill'),
  drillInput: document.querySelector('#drill-input'),
  drillStreak: document.querySelector('#drill-streak'),
  drillCorrect: document.querySelector('#drill-correct'),
  drillAccuracy: document.querySelector('#drill-accuracy'),
  drillTotal: document.querySelector('#drill-total'),
  drillFeedback: document.querySelector('#drill-feedback'),
  drillReset: document.querySelector('#drill-reset'),
  metricStrip: document.querySelector('#metric-strip'),
  timerValue: document.querySelector('#timer-value'),
  passageCategory: document.querySelector('#passage-category'),
  passageTitle: document.querySelector('#passage-title'),
  passageProgress: document.querySelector('#passage-progress'),
  targetText: document.querySelector('#target-text'),
  progressFill: document.querySelector('#progress-fill'),
  input: document.querySelector('#typing-input'),
  speed: document.querySelector('#speed-value'),
  correct: document.querySelector('#correct-value'),
  accuracy: document.querySelector('#accuracy-value'),
  status: document.querySelector('#practice-status'),
  statusLabel: document.querySelector('#status-label'),
  reset: document.querySelector('#reset-practice'),
  periodTabs: document.querySelectorAll('.period-tab'),
  rankingList: document.querySelector('#ranking-list'),
  rankingEmpty: document.querySelector('#ranking-empty'),
  leaderTop: document.querySelector('#leader-top'),
  leaderPeople: document.querySelector('#leader-people'),
  resultDialog: document.querySelector('#result-dialog'),
  closeResult: document.querySelector('#close-result'),
  retryChallenge: document.querySelector('#retry-challenge'),
  resultScore: document.querySelector('#result-score'),
  resultAccuracy: document.querySelector('#result-accuracy'),
  resultBest: document.querySelector('#result-best'),
  resultRank: document.querySelector('#result-rank'),
  accountButton: document.querySelector('#account-button'),
  accountAvatar: document.querySelector('#account-avatar'),
  accountName: document.querySelector('#account-name'),
  accountStatus: document.querySelector('#account-status'),
  authDialog: document.querySelector('#auth-dialog'),
  closeAuth: document.querySelector('#close-auth'),
  authHint: document.querySelector('#auth-hint'),
  authTabs: document.querySelectorAll('.auth-tab'),
  loginForm: document.querySelector('#login-form'),
  loginUsername: document.querySelector('#login-username'),
  loginPassword: document.querySelector('#login-password'),
  registerForm: document.querySelector('#register-form'),
  registerUsername: document.querySelector('#register-username'),
  registerDisplayName: document.querySelector('#register-display-name'),
  registerPassword: document.querySelector('#register-password'),
  registerConfirmPassword: document.querySelector('#register-confirm-password'),
  authError: document.querySelector('#auth-error'),
  accountDialog: document.querySelector('#account-dialog'),
  closeAccount: document.querySelector('#close-account'),
  profileAvatar: document.querySelector('#profile-avatar'),
  profileName: document.querySelector('#profile-name'),
  profileUsername: document.querySelector('#profile-username'),
  profileBest: document.querySelector('#profile-best'),
  profileRank: document.querySelector('#profile-rank'),
  profileAttempts: document.querySelector('#profile-attempts'),
  recentScoreList: document.querySelector('#recent-score-list'),
  recentScoreEmpty: document.querySelector('#recent-score-empty'),
  studentLogout: document.querySelector('#student-logout'),
  toast: document.querySelector('#toast')
};

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || '请求失败，请稍后重试');
    error.status = response.status;
    throw error;
  }
  return body;
}

let toastTimer;
function showToast(message, type = 'normal') {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('is-error', type === 'error');
  elements.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
}

function avatarCharacter(name = '登') {
  return Array.from(name.trim())[0] || '登';
}

function updateAccountUI() {
  const user = state.user;
  elements.accountAvatar.textContent = avatarCharacter(user?.displayName);
  elements.accountName.textContent = user?.displayName || '登录 / 注册';
  elements.accountStatus.textContent = user ? `@${user.username}` : '保存竞速成绩';
  elements.challengeAccountName.textContent = user ? `${user.displayName} · @${user.username}` : '登录后参加排行榜';
  elements.startChallengeLabel.textContent = user ? '开始挑战' : '登录后开始';
  elements.startChallengeIcon.setAttribute('data-lucide', user ? 'play' : 'log-in');
  window.lucide?.createIcons();
}

async function loadCurrentUser() {
  try {
    const data = await requestJSON('/api/auth/me');
    state.user = data.authenticated ? data.user : null;
  } catch {
    state.user = null;
  }
  updateAccountUI();
  return state.user;
}

function setAuthView(view) {
  state.authView = view;
  elements.authTabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.authView === view));
  elements.loginForm.hidden = view !== 'login';
  elements.registerForm.hidden = view !== 'register';
  elements.authError.textContent = '';
  window.setTimeout(() => (view === 'login' ? elements.loginUsername : elements.registerUsername).focus(), 0);
}

function openAuthDialog(view = 'login', hint = '') {
  elements.authHint.textContent = hint || '登录后，竞速成绩会计入你的个人最好成绩和班级排行榜。';
  setAuthView(view);
  if (!elements.authDialog.open) elements.authDialog.showModal();
}

async function handleAuthSuccess(user, message) {
  state.user = user;
  elements.authDialog.close();
  elements.loginForm.reset();
  elements.registerForm.reset();
  updateAccountUI();
  showToast(message);
  await loadLeaderboard();
  if (state.challenge && state.challenge.userId !== user.id) {
    clearPersistedChallenge();
    state.challenge = null;
    stopChallengeTimer();
    stopMetricTimer();
    showChallengeIntro();
    showToast('账号已切换，原账号的未完成挑战已取消');
    return;
  }
  if (state.pendingChallengeStart) {
    state.pendingChallengeStart = false;
    startChallenge();
  } else if (state.challenge && Date.now() >= state.challenge.localExpiresAt) {
    submitChallenge();
  }
}

function setFormBusy(form, busy) {
  form.querySelectorAll('button, input').forEach((control) => { control.disabled = busy; });
}

async function submitLogin(event) {
  event.preventDefault();
  elements.authError.textContent = '';
  setFormBusy(elements.loginForm, true);
  try {
    const data = await requestJSON('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: elements.loginUsername.value, password: elements.loginPassword.value })
    });
    await handleAuthSuccess(data.user, `欢迎回来，${data.user.displayName}`);
  } catch (error) {
    elements.authError.textContent = error.message;
  } finally {
    setFormBusy(elements.loginForm, false);
  }
}

async function submitRegistration(event) {
  event.preventDefault();
  elements.authError.textContent = '';
  if (elements.registerPassword.value !== elements.registerConfirmPassword.value) {
    elements.authError.textContent = '两次输入的密码不一致';
    return;
  }
  setFormBusy(elements.registerForm, true);
  try {
    const data = await requestJSON('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: elements.registerUsername.value,
        displayName: elements.registerDisplayName.value,
        password: elements.registerPassword.value
      })
    });
    if (data.pending) {
      state.pendingChallengeStart = false;
      elements.authDialog.close();
      elements.registerForm.reset();
      showToast(data.message || '注册申请已提交，请等待老师启用账号');
      return;
    }
    await handleAuthSuccess(data.user, '账号创建成功，成绩会自动保存');
  } catch (error) {
    elements.authError.textContent = error.message;
  } finally {
    setFormBusy(elements.registerForm, false);
  }
}

async function openAccountDialog() {
  if (!state.user) {
    openAuthDialog();
    return;
  }
  try {
    const data = await requestJSON('/api/account/stats');
    elements.profileAvatar.textContent = avatarCharacter(data.user.displayName);
    elements.profileName.textContent = data.user.displayName;
    elements.profileUsername.textContent = `@${data.user.username}`;
    elements.profileBest.textContent = data.personalBest;
    elements.profileRank.textContent = data.rank ? `#${data.rank}` : '--';
    elements.profileAttempts.textContent = data.attempts;
    elements.recentScoreEmpty.hidden = data.recent.length > 0;
    elements.recentScoreList.replaceChildren(...data.recent.map((score) => {
      const item = document.createElement('li');
      item.className = 'recent-score-row';
      const date = document.createElement('span'); date.textContent = formatDate(score.createdAt);
      const accuracy = document.createElement('span'); accuracy.textContent = `${score.accuracy}%`;
      const count = document.createElement('strong'); count.textContent = `${score.score} 字`;
      item.append(date, accuracy, count);
      return item;
    }));
    elements.accountDialog.showModal();
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      updateAccountUI();
      openAuthDialog('login', '登录状态已失效，请重新登录。');
    } else showToast(error.message, 'error');
  }
}

async function logoutStudent() {
  if (state.challenge && !window.confirm('退出账号会放弃当前竞速，确定退出吗？')) return;
  try {
    await requestJSON('/api/auth/logout', { method: 'POST', body: '{}' });
  } finally {
    clearPersistedChallenge();
    stopChallengeTimer();
    stopMetricTimer();
    state.challenge = null;
    state.user = null;
    updateAccountUI();
    elements.accountDialog.close();
    if (state.mode === 'challenge') showChallengeIntro();
    loadLeaderboard();
    showToast('已安全退出学生账号');
  }
}

const DRILL_BANKS = {
  home: [
    { code: 'KeyA', label: 'A', finger: '左手小指' }, { code: 'KeyS', label: 'S', finger: '左手无名指' },
    { code: 'KeyD', label: 'D', finger: '左手中指' }, { code: 'KeyF', label: 'F', finger: '左手食指' },
    { code: 'KeyJ', label: 'J', finger: '右手食指' }, { code: 'KeyK', label: 'K', finger: '右手中指' },
    { code: 'KeyL', label: 'L', finger: '右手无名指' }, { code: 'Semicolon', label: '；', finger: '右手小指' }
  ],
  reach: [
    { code: 'KeyQ', label: 'Q', finger: '左手小指' }, { code: 'KeyW', label: 'W', finger: '左手无名指' },
    { code: 'KeyE', label: 'E', finger: '左手中指' }, { code: 'KeyR', label: 'R', finger: '左手食指' },
    { code: 'KeyU', label: 'U', finger: '右手食指' }, { code: 'KeyI', label: 'I', finger: '右手中指' },
    { code: 'KeyO', label: 'O', finger: '右手无名指' }, { code: 'KeyP', label: 'P', finger: '右手小指' },
    { code: 'KeyZ', label: 'Z', finger: '左手小指' }, { code: 'KeyX', label: 'X', finger: '左手无名指' },
    { code: 'KeyC', label: 'C', finger: '左手中指' }, { code: 'KeyV', label: 'V', finger: '左手食指' },
    { code: 'KeyN', label: 'N', finger: '右手食指' }, { code: 'KeyM', label: 'M', finger: '右手食指' }
  ],
  mix: [
    ...'QWERTYUIOPASDFGHJKLZXCVBNM'.split('').map((letter) => ({ code: `Key${letter}`, label: letter, finger: '对应手指' })),
    ...'1234567890'.split('').map((digit) => ({ code: `Digit${digit}`, label: digit, finger: '数字行' })),
    { code: 'Comma', label: ',', finger: '右手小指附近' }, { code: 'Period', label: '.', finger: '右手小指附近' },
    { code: 'Slash', label: '/', finger: '右手小指附近' }, { code: 'Minus', label: '-', finger: '右手小指附近' }
  ]
};

function drillBank() {
  return DRILL_BANKS[state.drillLevel] || DRILL_BANKS.home;
}

function generateDrillSequence() {
  const bank = drillBank();
  const sequence = [];
  while (sequence.length < 28) {
    const candidate = bank[Math.floor(Math.random() * bank.length)];
    if (sequence.at(-1)?.code === candidate.code && bank.length > 1) continue;
    sequence.push(candidate);
  }
  state.drillSequence = sequence;
  state.drillIndex = 0;
  state.drillRound += 1;
  renderDrill();
}

function renderFingerStep() {
  elements.fingerStepButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.fingerStep === state.fingerStep));
  elements.courseTabs.forEach((button) => button.classList.toggle('is-active', button.dataset.courseTab === state.fingerStep));
  elements.fingerPositionPanel.hidden = state.fingerStep !== 'position';
  elements.fingerDrillPanel.hidden = state.fingerStep !== 'drill';
  moveKeyboardPanel(state.mode);
  if (state.fingerStep === 'drill') {
    if (!state.drillSequence.length) generateDrillSequence();
    window.setTimeout(() => elements.drillInput.focus(), 0);
  }
}

function moveKeyboardPanel(mode) {
  if (!elements.virtualKeyboardPanel) return;
  if (mode === 'fingers') {
    if (state.fingerStep === 'drill') {
      const drillInputZone = elements.fingerDrillPanel.querySelector('.drill-input-zone');
      if (drillInputZone) elements.fingerDrillPanel.insertBefore(elements.virtualKeyboardPanel, drillInputZone);
      else elements.fingerDrillPanel.append(elements.virtualKeyboardPanel);
    } else if (elements.fingerPositionPanel?.parentElement === elements.fingerWorkspace) {
      elements.fingerWorkspace.insertBefore(elements.virtualKeyboardPanel, elements.fingerPositionPanel);
    }
  } else if (elements.virtualKeyboardPanel.parentElement !== document.querySelector('.trainer')) {
    document.querySelector('.trainer').append(elements.virtualKeyboardPanel);
  }
}

function setFingerStep(step) {
  state.fingerStep = step;
  renderFingerStep();
}

function applyFingerCourse(course) {
  if (course === 'advanced') {
    state.drillLevel = 'reach';
    elements.drillLevels.forEach((item) => item.classList.toggle('is-active', item.dataset.drillLevel === 'reach'));
    setFingerStep('drill');
  } else {
    state.drillLevel = 'home';
    elements.drillLevels.forEach((item) => item.classList.toggle('is-active', item.dataset.drillLevel === 'home'));
    setFingerStep('position');
  }
  state.drillCorrect = 0;
  state.drillWrong = 0;
  state.drillStreak = 0;
  state.drillSequence = [];
  if (state.fingerStep === 'drill') generateDrillSequence();
  setDrillFeedback(course === 'advanced' ? '高级课程会加入上下排，先回到 F/J 找准手位。' : '初级课程从基准键开始，熟悉后再进入连续练习。');
}

function renderDrill() {
  const current = state.drillSequence[state.drillIndex] || state.drillSequence[0] || DRILL_BANKS.home[0];
  window.dispatchEvent(new CustomEvent('virtual-key-target', { detail: { code: current.code } }));
  elements.drillNextKey.textContent = current.label;
  elements.drillFingerHint.textContent = `${current.finger} · ${state.drillLevel === 'home' ? '基准键' : state.drillLevel === 'reach' ? '上下排' : '全键区'}`;
  elements.drillSequence.replaceChildren(...state.drillSequence.map((item, index) => {
    const key = document.createElement('span');
    key.className = `drill-sequence-key${index < state.drillIndex ? ' is-done' : ''}${index === state.drillIndex ? ' is-current' : ''}`;
    key.textContent = item.label;
    return key;
  }));
  elements.drillProgressFill.style.width = `${(state.drillIndex / Math.max(1, state.drillSequence.length)) * 100}%`;
  const total = state.drillCorrect + state.drillWrong;
  elements.drillStreak.textContent = state.drillStreak;
  elements.drillCorrect.textContent = state.drillCorrect;
  elements.drillAccuracy.textContent = `${total ? Math.round((state.drillCorrect / total) * 100) : 100}%`;
  elements.drillTotal.textContent = total;
}

function setDrillFeedback(message, kind = 'info') {
  const icon = kind === 'success' ? 'check' : kind === 'error' ? 'circle-x' : 'info';
  elements.drillFeedback.innerHTML = `<i data-lucide="${icon}"></i>${message}`;
  elements.drillFeedback.classList.toggle('is-success', kind === 'success');
  elements.drillFeedback.classList.toggle('is-error', kind === 'error');
  window.lucide?.createIcons();
}

function handleDrillKey({ code, repeat = false } = {}) {
  if (state.mode !== 'fingers' || state.fingerStep !== 'drill' || repeat) return;
  const expected = state.drillSequence[state.drillIndex];
  if (!expected) return;
  if (code === expected.code) {
    state.drillCorrect += 1;
    state.drillStreak += 1;
    state.drillIndex += 1;
    if (state.drillIndex >= state.drillSequence.length) {
      setDrillFeedback(`第 ${state.drillRound} 组完成，继续保持这个节奏。`, 'success');
      generateDrillSequence();
      return;
    }
    setDrillFeedback(state.drillStreak >= 8 ? '节奏很稳，继续保持。' : '正确，按下一个键。', 'success');
  } else {
    state.drillWrong += 1;
    state.drillStreak = 0;
    setDrillFeedback(`目标是 ${expected.label}，回到手位再试一次。`, 'error');
  }
  renderDrill();
}

function initializeFingerMode() {
  state.drillSequence = [];
  state.drillCorrect = 0;
  state.drillWrong = 0;
  state.drillStreak = 0;
  state.drillRound = 0;
  generateDrillSequence();
  renderFingerStep();
}

function getTypedCharacters() {
  return Array.from(elements.input.value).filter((character) => !/\s/u.test(character));
}

function getTargetCharacters() {
  return Array.from(state.passage?.content || '').filter((character) => !/\s/u.test(character));
}

function calculateLocalScore() {
  const target = getTargetCharacters();
  const typed = getTypedCharacters().slice(0, target.length);
  let correct = 0;
  typed.forEach((character, index) => {
    if (character === target[index]) correct += 1;
  });
  return {
    typed: typed.length,
    correct,
    accuracy: typed.length ? (correct / typed.length) * 100 : 100,
    targetLength: target.length
  };
}

function renderTarget() {
  const characters = getTargetCharacters();
  elements.targetText.replaceChildren(...characters.map((character, index) => {
    const span = document.createElement('span');
    span.className = 'target-char';
    span.textContent = character;
    span.dataset.index = index;
    return span;
  }));
}

function updateTypingView({ scroll = false } = {}) {
  if (!state.passage) return;
  const target = getTargetCharacters();
  const typed = getTypedCharacters();
  const result = calculateLocalScore();

  elements.targetText.querySelectorAll('.target-char').forEach((span, index) => {
    span.classList.toggle('is-correct', index < typed.length && typed[index] === target[index]);
    span.classList.toggle('is-wrong', index < typed.length && typed[index] !== target[index]);
    span.classList.toggle('is-current', index === Math.min(typed.length, target.length - 1));
  });

  elements.correct.textContent = result.correct;
  elements.accuracy.textContent = Math.round(result.accuracy);
  elements.passageProgress.textContent = `${result.typed} / ${result.targetLength}`;
  elements.progressFill.style.width = `${Math.min(100, (result.typed / Math.max(1, result.targetLength)) * 100)}%`;

  const elapsedMinutes = state.startedAt ? Math.max((Date.now() - state.startedAt) / 60_000, 1 / 60) : 0;
  elements.speed.textContent = elapsedMinutes ? Math.round(result.correct / elapsedMinutes) : 0;

  if (result.typed >= result.targetLength && result.targetLength > 0) {
    elements.status.classList.remove('is-running');
    elements.statusLabel.textContent = state.mode === 'challenge' ? '文章已打完' : '练习完成';
    if (state.mode === 'practice' && !state.practiceCompleted) {
      state.practiceCompleted = true;
      showToast(`练习完成：${result.correct} 字，正确率 ${Math.round(result.accuracy)}%`);
    }
  } else if (result.typed > 0) {
    elements.status.classList.add('is-running');
    elements.statusLabel.textContent = state.mode === 'challenge' ? '竞速进行中' : '练习进行中';
  } else {
    elements.status.classList.remove('is-running');
    elements.statusLabel.textContent = state.mode === 'challenge' ? '等待输入' : '准备开始';
  }

  if (scroll) {
    const current = elements.targetText.querySelector('.is-current');
    current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }
}

function setPassage(passage) {
  state.passage = passage;
  state.startedAt = null;
  state.practiceCompleted = false;
  elements.input.value = '';
  elements.passageCategory.textContent = passage.category;
  elements.passageTitle.textContent = passage.title;
  elements.input.maxLength = Array.from(passage.content).length + 100;
  renderTarget();
  updateTypingView();
  elements.targetText.scrollTop = 0;
}

async function loadPracticePassage() {
  elements.input.disabled = true;
  try {
    const query = new URLSearchParams({ random: '1' });
    if (elements.category.value) query.set('category', elements.category.value);
    const data = await requestJSON(`/api/passages?${query}`);
    if (!data.passages.length) throw new Error('这个分类暂时没有练习文章');
    setPassage(data.passages[0]);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.input.disabled = false;
  }
}

async function initializePractice() {
  try {
    const data = await requestJSON('/api/passages');
    const previous = elements.category.value;
    elements.category.replaceChildren(new Option('全部分类', ''), ...data.categories.map((category) => new Option(category, category)));
    const requested = state.practiceCategory || previous;
    if (requested && data.categories.includes(requested)) {
      elements.category.value = requested;
      state.practiceCategory = null;
      await loadPracticePassage();
      return;
    }
    state.practiceCategory = null;
    if (data.categories.includes(previous)) elements.category.value = previous;
    if (data.passages.length) setPassage(data.passages[0]);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function resetTyping() {
  state.startedAt = null;
  state.practiceCompleted = false;
  elements.input.value = '';
  elements.targetText.scrollTop = 0;
  updateTypingView();
  elements.input.focus();
}

function stopChallengeTimer() {
  window.clearInterval(state.timer);
  state.timer = null;
}

function startMetricTimer() {
  if (state.metricTimer) return;
  state.metricTimer = window.setInterval(() => {
    if (state.startedAt && !elements.input.disabled) updateTypingView();
  }, 1000);
}

function stopMetricTimer() {
  window.clearInterval(state.metricTimer);
  state.metricTimer = null;
}

function persistChallenge() {
  if (!state.challenge) return;
  localStorage.setItem(ACTIVE_CHALLENGE_KEY, JSON.stringify({
    ...state.challenge,
    userId: state.user?.id,
    passage: state.passage,
    typedText: elements.input.value
  }));
}

function clearPersistedChallenge() {
  localStorage.removeItem(ACTIVE_CHALLENGE_KEY);
}

function showChallengeIntro() {
  stopChallengeTimer();
  stopMetricTimer();
  state.challenge = null;
  state.startedAt = null;
  document.body.classList.remove('is-finger-mode');
  elements.fingerWorkspace.hidden = true;
  elements.raceIntro.hidden = false;
  elements.typingWorkspace.hidden = true;
  updateAccountUI();
}

async function startChallenge() {
  if (!state.user) {
    state.pendingChallengeStart = true;
    openAuthDialog('login', '请先登录学生账号，挑战成绩才能计入排行榜。');
    return;
  }

  elements.startChallenge.disabled = true;
  try {
    const data = await requestJSON('/api/challenges', { method: 'POST', body: '{}' });
    state.challenge = { ...data, userId: state.user.id, localExpiresAt: Date.now() + data.durationSeconds * 1000, submitting: false };
    state.startedAt = Date.now();
    setPassage(data.passage);
    state.startedAt = Date.now();
    elements.raceIntro.hidden = true;
    elements.typingWorkspace.hidden = false;
    elements.challengeTimer.hidden = false;
    elements.timerValue.textContent = '60';
    elements.input.disabled = false;
    elements.input.focus();
    state.timer = window.setInterval(updateChallengeTimer, 100);
    startMetricTimer();
    persistChallenge();
    updateTypingView();
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      updateAccountUI();
      state.pendingChallengeStart = true;
      openAuthDialog('login', '登录状态已失效，请重新登录后开始挑战。');
    } else showToast(error.message, 'error');
  } finally {
    elements.startChallenge.disabled = false;
  }
}

function updateChallengeTimer() {
  if (!state.challenge) return;
  const remaining = Math.max(0, state.challenge.localExpiresAt - Date.now());
  elements.timerValue.textContent = Math.ceil(remaining / 1000);
  if (remaining <= 0) submitChallenge();
}

async function submitChallenge() {
  if (!state.challenge || state.challenge.submitting) return;
  state.challenge.submitting = true;
  stopChallengeTimer();
  elements.input.disabled = true;
  elements.timerValue.textContent = '0';
  elements.status.classList.remove('is-running');
  elements.statusLabel.textContent = '正在交卷';

  try {
    const result = await requestJSON(`/api/challenges/${state.challenge.sessionId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ typedText: elements.input.value })
    });
    elements.statusLabel.textContent = '挑战完成';
    elements.resultScore.textContent = result.score;
    elements.resultAccuracy.textContent = `${result.accuracy}%`;
    elements.resultBest.textContent = `${result.personalBest} 字`;
    elements.resultRank.textContent = `第 ${result.rank} 名`;
    clearPersistedChallenge();
    state.challenge = null;
    stopMetricTimer();
    elements.resultDialog.showModal();
    await loadLeaderboard();
  } catch (error) {
    if (error.status === 401) {
      state.challenge.submitting = false;
      persistChallenge();
      state.user = null;
      updateAccountUI();
      openAuthDialog('login', '登录状态已失效，重新登录后会继续提交本次成绩。');
      return;
    }
    if ([403, 404, 409, 410].includes(error.status)) {
      clearPersistedChallenge();
      state.challenge = null;
      stopMetricTimer();
      elements.statusLabel.textContent = '挑战已失效';
      showToast(error.message, 'error');
      window.setTimeout(showChallengeIntro, 1200);
      return;
    }
    showToast(error.message, 'error');
    elements.statusLabel.textContent = '提交失败，正在重试';
    state.challenge.submitting = false;
    persistChallenge();
    window.setTimeout(() => {
      if (state.challenge && !state.challenge.submitting) submitChallenge();
    }, 2500);
  }
}

function restoreChallenge() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(ACTIVE_CHALLENGE_KEY));
  } catch {
    clearPersistedChallenge();
    return false;
  }
  if (!saved?.sessionId || !saved?.passage || !saved?.userId || !saved?.localExpiresAt) return false;
  if (!state.user || saved.userId !== state.user.id) {
    clearPersistedChallenge();
    return false;
  }
  if (Date.now() > saved.localExpiresAt + 10 * 60 * 1000) {
    clearPersistedChallenge();
    return false;
  }

  state.mode = 'challenge';
  state.challenge = { ...saved, submitting: false };
  state.startedAt = saved.localExpiresAt - saved.durationSeconds * 1000;
  elements.modeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.mode === 'challenge'));
  elements.practiceTools.hidden = true;
  elements.metricStrip.classList.add('is-challenge');
  elements.challengeTimer.hidden = false;
  elements.reset.hidden = true;
  elements.modeEyebrow.textContent = '一分钟竞速';
  elements.modeTitle.textContent = '六十秒，看看你能走多远。';
  elements.raceIntro.hidden = true;
  elements.typingWorkspace.hidden = false;
  elements.fingerWorkspace.hidden = true;
  document.body.classList.remove('is-finger-mode');
  setPassage(saved.passage);
  state.startedAt = saved.localExpiresAt - saved.durationSeconds * 1000;
  elements.input.value = saved.typedText || '';
  elements.input.disabled = Date.now() >= saved.localExpiresAt;
  updateTypingView();
  startMetricTimer();

  if (Date.now() >= saved.localExpiresAt) {
    elements.timerValue.textContent = '0';
    submitChallenge();
  } else {
    updateChallengeTimer();
    state.timer = window.setInterval(updateChallengeTimer, 100);
    elements.input.focus();
    showToast('已恢复未完成的一分钟挑战');
  }
  return true;
}

function switchMode(mode) {
  if (mode === state.mode && !document.body.classList.contains('is-home')) return;
  if (state.mode === 'challenge' && state.challenge?.submitting) {
    showToast('成绩正在提交，请稍候');
    return;
  }
  if (state.mode === 'challenge' && state.challenge && !state.challenge.submitting) {
    const abandon = window.confirm('一分钟挑战正在进行，确定要放弃本次成绩吗？');
    if (!abandon) return;
    clearPersistedChallenge();
  }
  stopChallengeTimer();
  stopMetricTimer();
  window.dispatchEvent(new CustomEvent('virtual-key-target', { detail: { code: null } }));
  document.body.classList.remove('is-home');
  state.mode = mode;
  document.body.classList.toggle('is-finger-mode', mode === 'fingers');
  elements.modeButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.mode === mode));
  elements.practiceTools.hidden = mode !== 'practice';
  elements.challengeTimer.hidden = mode !== 'challenge';
  elements.fingerWorkspace.hidden = mode !== 'fingers';
  elements.metricStrip.classList.toggle('is-challenge', mode === 'challenge');
  elements.reset.hidden = mode === 'challenge';
  moveKeyboardPanel(mode);

  if (mode === 'practice') {
    state.challenge = null;
    elements.modeEyebrow.textContent = '自由练习';
    elements.modeTitle.textContent = '今天，认真打好每一个字。';
    elements.raceIntro.hidden = true;
    elements.typingWorkspace.hidden = false;
    elements.input.disabled = false;
    initializePractice();
  } else if (mode === 'fingers') {
    state.challenge = null;
    elements.modeEyebrow.textContent = '键盘熟悉';
    elements.modeTitle.textContent = '先放对手，再按对键。';
    elements.raceIntro.hidden = true;
    elements.typingWorkspace.hidden = true;
    elements.fingerWorkspace.hidden = false;
    elements.input.disabled = true;
    state.fingerStep = 'position';
    renderFingerStep();
    initializeFingerMode();
  } else {
    elements.fingerWorkspace.hidden = true;
    elements.modeEyebrow.textContent = '一分钟竞速';
    elements.modeTitle.textContent = '六十秒，看看你能走多远。';
    showChallengeIntro();
  }
}

function formatDate(value) {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

async function loadLeaderboard() {
  try {
    const data = await requestJSON(`/api/leaderboard?period=${state.leaderboardPeriod}&limit=10`);
    elements.leaderTop.textContent = data.totals.topScore;
    elements.leaderPeople.textContent = data.totals.participants;
    elements.rankingEmpty.hidden = data.rows.length > 0;
    elements.rankingList.replaceChildren(...data.rows.map((row) => {
      const item = document.createElement('li');
      item.className = `rank-row${row.isCurrentUser ? ' is-current-user' : ''}`;

      const rank = document.createElement('span');
      rank.className = 'rank-number';
      rank.textContent = row.rank;

      const person = document.createElement('div');
      person.className = 'rank-person';
      const name = document.createElement('strong');
      name.textContent = row.nickname;
      const meta = document.createElement('span');
      meta.textContent = `${row.accuracy}% 正确率 · ${formatDate(row.createdAt)}`;
      person.append(name, meta);

      const score = document.createElement('div');
      score.className = 'rank-score';
      const number = document.createElement('strong');
      number.textContent = row.score;
      const unit = document.createElement('small');
      unit.textContent = '字';
      score.append(number, unit);

      item.append(rank, person, score);
      return item;
    }));
  } catch (error) {
    showToast(error.message, 'error');
  }
}

elements.input.addEventListener('compositionstart', () => { state.composing = true; });
elements.input.addEventListener('compositionend', () => {
  state.composing = false;
  if (!state.startedAt) state.startedAt = Date.now();
  updateTypingView({ scroll: true });
  if (state.mode === 'challenge') persistChallenge();
});
elements.input.addEventListener('input', () => {
  if (state.composing) return;
  if (!state.startedAt && elements.input.value) state.startedAt = Date.now();
  if (state.startedAt) startMetricTimer();
  updateTypingView({ scroll: true });
  if (state.mode === 'challenge') persistChallenge();
});
elements.input.addEventListener('paste', (event) => {
  if (state.mode !== 'challenge') return;
  event.preventDefault();
  showToast('一分钟竞速不支持粘贴，请使用中文输入法完成挑战', 'error');
});
elements.input.addEventListener('drop', (event) => {
  if (state.mode !== 'challenge') return;
  event.preventDefault();
  showToast('一分钟竞速不支持拖入文字', 'error');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Tab' && document.activeElement === document.body && !elements.authDialog.open && !elements.accountDialog.open) {
    event.preventDefault();
    elements.input.focus();
  }
});
elements.modeButtons.forEach((button) => button.addEventListener('click', () => {
  if (button.dataset.mode === 'practice') state.practiceCategory = null;
  switchMode(button.dataset.mode);
}));
elements.homeCards.forEach((card) => card.addEventListener('click', () => {
  state.practiceCategory = card.dataset.homeCategory || null;
  switchMode(card.dataset.homeMode);
}));
elements.fingerStepButtons.forEach((button) => button.addEventListener('click', () => {
  setFingerStep(button.dataset.fingerStep);
}));
elements.courseTabs.forEach((button) => button.addEventListener('click', () => setFingerStep(button.dataset.courseTab)));
elements.fingerCourseBack.addEventListener('click', () => switchMode('practice'));
elements.fingerCourseSelect.addEventListener('change', () => applyFingerCourse(elements.fingerCourseSelect.value));
elements.fingerStartDrill.addEventListener('click', () => {
  setFingerStep('drill');
});
elements.drillLevels.forEach((button) => button.addEventListener('click', () => {
  state.drillLevel = button.dataset.drillLevel;
  state.drillCorrect = 0;
  state.drillWrong = 0;
  state.drillStreak = 0;
  elements.drillLevels.forEach((item) => item.classList.toggle('is-active', item === button));
  generateDrillSequence();
  setDrillFeedback('新的一组键位已准备好，先看清当前目标。');
  elements.drillInput.focus();
}));
elements.drillReset.addEventListener('click', () => {
  state.drillCorrect = 0;
  state.drillWrong = 0;
  state.drillStreak = 0;
  generateDrillSequence();
  setDrillFeedback('换一组键位，放慢一点开始。');
  elements.drillInput.focus();
});
elements.drillInput.addEventListener('keydown', (event) => {
  if (state.mode !== 'fingers' || state.fingerStep !== 'drill') return;
  if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  handleDrillKey({ code: event.code, repeat: event.repeat });
});
window.addEventListener('virtual-keydown', (event) => handleDrillKey(event.detail));
elements.nextPassage.addEventListener('click', loadPracticePassage);
elements.category.addEventListener('change', loadPracticePassage);
elements.reset.addEventListener('click', resetTyping);
elements.startChallenge.addEventListener('click', startChallenge);
elements.challengeAccount.addEventListener('click', () => state.user ? openAccountDialog() : openAuthDialog());
elements.accountButton.addEventListener('click', openAccountDialog);
elements.authTabs.forEach((tab) => tab.addEventListener('click', () => setAuthView(tab.dataset.authView)));
elements.loginForm.addEventListener('submit', submitLogin);
elements.registerForm.addEventListener('submit', submitRegistration);
elements.closeAuth.addEventListener('click', () => {
  state.pendingChallengeStart = false;
  elements.authDialog.close();
});
elements.authDialog.addEventListener('cancel', () => { state.pendingChallengeStart = false; });
elements.closeAccount.addEventListener('click', () => elements.accountDialog.close());
elements.studentLogout.addEventListener('click', logoutStudent);
elements.periodTabs.forEach((tab) => tab.addEventListener('click', () => {
  state.leaderboardPeriod = tab.dataset.period;
  elements.periodTabs.forEach((item) => item.classList.toggle('is-active', item === tab));
  loadLeaderboard();
}));
elements.closeResult.addEventListener('click', () => elements.resultDialog.close());
elements.retryChallenge.addEventListener('click', () => {
  elements.resultDialog.close();
  showChallengeIntro();
});

window.addEventListener('DOMContentLoaded', async () => {
  window.lucide?.createIcons();
  await loadCurrentUser();
  initializeFingerMode();
  if (!restoreChallenge()) initializePractice();
  loadLeaderboard();
});
