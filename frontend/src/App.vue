<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import AppHeader from './AppHeader.vue';
import Keyboard from './Keyboard.vue';
import BeginnerKeyboard from './BeginnerKeyboard.vue';
import StatsBar from './StatsBar.vue';
import PinyinLineInput from './PinyinLineInput.vue';
const BattleGame = defineAsyncComponent(() => import('./BattleGame.vue'));
const BossGame = defineAsyncComponent(() => import('./BossGame.vue'));
const ArenaGame = defineAsyncComponent(() => import('./ArenaGame.vue'));
const GameLobby = defineAsyncComponent(() => import('./GameLobby.vue'));
const ChaseGame = defineAsyncComponent(() => import('./ChaseGame.vue'));
const RunnerGame = defineAsyncComponent(() => import('./RunnerGame.vue'));
const BugFeedback = defineAsyncComponent(() => import('./BugFeedback.vue'));
const CompetitionGame = defineAsyncComponent(() => import('./CompetitionGame.vue'));
import { beginnerLessons, extraEnglishCopy, extraPinyinCopy, fingerKeyByCode } from './lesson-bank';
import { expandPracticeBank } from './lesson-expansion';
import { readPracticeIndex, savePracticeIndex } from './practice-progress.mjs';
import { AlertTriangle, ArrowLeft, ArrowUpRight, BarChart3, ChevronRight, Flame, Keyboard as KeyboardIcon, ListChecks, LogOut, ShieldCheck, Target, Timer, Trophy, UserRound } from 'lucide-vue-next';
const page = ref('home'); const category = ref('英文打字'); const passage = ref(null); const typed = ref(''); const pressedCode = ref(null); const wrongCode = ref(null); const wrongNotice = ref(''); const lastCode = ref('KeyboardEvent.code'); const beginnerSequence = ref([]); const beginnerIndex = ref(0); const beginnerCorrect = ref(0); const beginnerWrong = ref(0); const beginnerStartedAt = ref(null); const practiceStartedAt = ref(null); const now = ref(Date.now()); let timer; let wrongFeedbackTimer;
const user = ref(null);
const authOpen = ref(false);
const authView = ref('login');
const authBusy = ref(false);
const authMessage = ref('');
const avatarFileEl = ref(null);
const avatarBusy = ref(false);
const avatarMessage = ref('');
const loginForm = reactive({ username: '', password: '' });
const registerForm = reactive({ displayName: '', password: '' });
const challenge = ref(null);
const challengeMode = ref('pinyin');
const challengeInput = ref('');
const challengeInputEl = ref(null);
const challengeAnchorEl = ref(null);
const challengeResult = ref(null);
const challengeSubmitting = ref(false);
// 点「开始挑战」后先走一段全屏倒计时，服务端也把 startedAt 顺延同样的时长
const challengeCountdown = ref(0);
const challengeCountdownMs = 3000;
let challengeCountdownTimer = null;
const leaderboardOpen = ref(false);
const leaderboardRows = ref([]);
const leaderboardTotals = reactive({ topScore: 0, participants: 0 });
const challengeLeaderboards = reactive({
  english: { rows: [], totals: { topScore: 0, participants: 0 } },
  pinyin: { rows: [], totals: { topScore: 0, participants: 0 } }
});
const challengeLeaderboardLoading = ref(false);
const learningSummary = ref(null);
const learningDiagnostics = ref(null);
const learningLoading = ref(false);
const assignments = ref([]);
const pendingAssignmentCount = computed(() => assignments.value.filter((item) => item.status !== 'completed').length);
const diagnosticInput = ref('');
const diagnosticInputEl = ref(null);
const diagnosticDrill = reactive({ title: '', target: '', startedAt: null, completed: false });
const diagnosticLastTrackedLength = ref(0);
const pinyinInput = ref('');
const pinyinInputEl = ref(null);
const englishLessonIndex = reactive(Object.fromEntries(['english-word', 'english-phrase', 'english-article'].map((mode) => [mode, readPracticeIndex(mode)])));
const pinyinLessonIndex = reactive(Object.fromEntries(['pinyin-syllable', 'pinyin-word', 'pinyin-article'].map((mode) => [mode, readPracticeIndex(mode)])));
const beginnerLessonIndex = ref(readPracticeIndex('beginner'));
const beginnerCompleted = ref(false);
const practiceCompleteNotice = ref('');
let practiceAdvanceTimer;
const challengeStorageKey = 'typingActiveChallengeVue';
const activeKeyStats = new Map();
const keyboardLayout = window.KeyboardLayout || { keys: [], typingRows: [] };
const keyboard = keyboardLayout.keys;
const typingRows = keyboardLayout.typingRows;
const keysByCode = computed(() => Object.fromEntries(keyboard.map((key) => [key.code, key])));
const targetChars = computed(() => Array.from(passage.value?.content || '').filter((char) => category.value === '拼音打字' || !/\s/u.test(char)));
const score = computed(() => { const input = Array.from(typed.value).filter((char) => !/\s/u.test(char)); let correct = 0; input.slice(0, targetChars.value.length).forEach((char, i) => { if (char === targetChars.value[i]) correct += 1; }); return { input, correct, accuracy: input.length ? Math.round((correct / input.length) * 100) : 100 }; });
const handGuides = {
  'left-pinky': { label: '左手小指', home: 'A', x: 31, y: 55, action: '从 A 向左上伸展，按完回到 A' },
  'left-ring': { label: '左手无名指', home: 'S', x: 61, y: 29, action: '从 S 向上伸展，按完回到 S' },
  'left-middle': { label: '左手中指', home: 'D', x: 90, y: 14, action: '从 D 向上伸展，按完回到 D' },
  'left-index': { label: '左手食指', home: 'F', x: 130, y: 34, action: '以 F 为基准左右跨列，按完回到 F' },
  'right-index': { label: '右手食指', home: 'J', x: 380, y: 34, action: '以 J 为基准左右跨列，按完回到 J' },
  'right-middle': { label: '右手中指', home: 'K', x: 417, y: 14, action: '从 K 向上伸展，按完回到 K' },
  'right-ring': { label: '右手无名指', home: 'L', x: 445, y: 29, action: '从 L 向上伸展，按完回到 L' },
  'right-pinky': { label: '右手小指', home: '；', x: 478, y: 55, action: '从 ；向上或向右伸展，按完回到 ；' },
  thumbs: { label: '双手拇指', home: '空格', points: [{ x: 163, y: 119 }, { x: 344, y: 119 }], action: '使用任一拇指击打空格，手腕保持放松' }
};
const beginnerTarget = computed(() => beginnerSequence.value[beginnerIndex.value] || { label: 'A', code: 'KeyA', finger: '左手小指' });
const beginnerLesson = computed(() => beginnerLessons[beginnerLessonIndex.value % beginnerLessons.length]);
const handTargetMeta = computed(() => handGuides[beginnerTarget.value.fingerKey || fingerKeyByCode[beginnerTarget.value.code] || 'left-pinky'] || handGuides['left-pinky']);
const handTargetPoints = computed(() => handTargetMeta.value.points || [{ x: handTargetMeta.value.x, y: handTargetMeta.value.y }]);
const beginnerAccuracy = computed(() => { const total = beginnerCorrect.value + beginnerWrong.value; return total ? Math.round((beginnerCorrect.value / total) * 100) : 100; });
const beginnerElapsed = computed(() => beginnerStartedAt.value ? Math.max(0, now.value - beginnerStartedAt.value) : 0); const beginnerSeconds = computed(() => Math.floor(beginnerElapsed.value / 1000)); const beginnerSpeed = computed(() => beginnerElapsed.value ? Math.round(beginnerCorrect.value / (beginnerElapsed.value / 60000)) : 0);
const englishCopy = {
  'english-word': [
    { title: '单词练习', selector: '2000个最常用单词1', content: 'the be of and a to in he have it that for they I with as not on', note: 'the：art.这(那个)；这(那)些(指特定的人或物)' },
    { title: '单词练习', selector: '2000个最常用单词2', content: 'this but his by from they we say her she or an will my one all would there', note: 'this：pron.这；这个' },
    { title: '单词练习', selector: '2000个最常用单词3', content: 'their what so up out if about who get which go me when make can like time', note: 'practice：v.练习；训练' },
    { title: '单词练习', selector: '2000个最常用单词4', content: 'know take people into year your good some could them see other than then now', note: 'accuracy：n.准确；准确性' }
  ],
  'english-phrase': [
    { title: '语句练习', selector: '最常用英语口语1', content: 'I see I quit Let go Me too My god No way Come on Hold on I agree', note: '' },
    { title: '语句练习', selector: '最常用英语口语2', content: 'Good morning. How are you? Thank you very much. See you later.', note: '' },
    { title: '语句练习', selector: '最常用英语口语3', content: 'What do you mean? I am sorry. Never mind. That sounds great.', note: '' },
    { title: '语句练习', selector: '最常用英语口语4', content: 'Have a nice day. Take your time. Please come in. I am ready.', note: '' }
  ],
  'english-article': [
    { title: '文章练习', selector: "Anne's best friend", lines: ['Do you want a friend whom you could tell everything to, like your', 'deepest feelings and thoughts? Or are you afraid that your friend', 'would laugh at you, or would not understand what you are going thr', 'ough? Anne Frank wanted the first kind, so she made her diary her', 'best friend.'], note: '' },
    { title: '文章练习', selector: 'A bright day at school', lines: ['A bright day at school begins with a clear plan and a kind word.', 'We read the task, organize our notes, and finish one thing at a', 'time. Good typing is not only about speed; it is also about', 'accuracy, rhythm, and focus. Small steps make steady progress.'], note: '' },
    { title: '文章练习', selector: 'Learning to type', lines: ['Learning to type takes patience, practice, and a relaxed pair of', 'hands. Look at the screen, keep your fingers near the home row,', 'and correct each mistake calmly. With regular practice, your speed', 'will grow together with your confidence.'], note: '' }
  ]
};
Object.entries(extraEnglishCopy).forEach(([lessonPage, lessons]) => englishCopy[lessonPage].push(...lessons));
const englishLesson = computed(() => {
  const lessons = englishCopy[page.value] || [];
  return lessons[englishLessonIndex[page.value] % Math.max(1, lessons.length)] || null;
});
const englishTarget = computed(() => englishLesson.value?.content || englishLesson.value?.lines?.join('') || '');
const englishTypedCharacters = computed(() => Array.from(typed.value));
const englishCorrect = computed(() => englishTypedCharacters.value.reduce((total, char, index) => total + (char === englishTarget.value[index] ? 1 : 0), 0));
const englishAccuracy = computed(() => englishTypedCharacters.value.length ? Math.round((englishCorrect.value / englishTypedCharacters.value.length) * 100) : 100);
const englishProgress = computed(() => Math.round((englishTypedCharacters.value.length / Math.max(1, englishTarget.value.length)) * 100));
const practiceElapsed = computed(() => practiceStartedAt.value ? Math.max(0, now.value - practiceStartedAt.value) : 0);
const practiceSeconds = computed(() => Math.floor(practiceElapsed.value / 1000));
const englishSpeed = computed(() => practiceElapsed.value ? Math.round(englishCorrect.value / (practiceElapsed.value / 60000)) : 0);
const englishArticleLines = computed(() => {
  let offset = 0;
  return (englishLesson.value?.lines || []).map((line) => {
    const segment = { line, offset };
    offset += line.length;
    return segment;
  });
});
const englishInlineSegments = computed(() => {
  const text=englishTarget.value, segments=[]; let offset=0;
  while(offset<text.length) {
    let end=Math.min(offset+68,text.length);
    if(end<text.length) { const space=text.lastIndexOf(' ',end); if(space>offset+36) end=space; }
    segments.push({line:text.slice(offset,end),offset}); offset=end;
    while(/\s/.test(text[offset] || '')) offset += 1;
  }
  return segments.length?segments:[{line:'',offset:0}];
});
const englishActiveSegment = computed(() => englishInlineSegments.value.find(segment => englishTypedCharacters.value.length < segment.offset+segment.line.length) || englishInlineSegments.value.at(-1));
const englishVisibleArticleLines = computed(() => {
  const lines=englishArticleLines.value, pageSize=5; let start=0;
  while(start+pageSize<lines.length && englishTypedCharacters.value.length>=lines[start+pageSize].offset) start+=pageSize;
  return lines.slice(start,start+pageSize);
});
const pinyinCopy = {
  'pinyin-syllable': [
    { level: '第二关', title: '音节练习', selector: '声母', syllables: [['b', '玻'], ['p', '坡'], ['m', '摸'], ['f', '佛'], ['d', '得'], ['t', '特'], ['n', '呢'], ['l', '了'], ['g', '哥'], ['k', '科'], ['h', '喝'], ['j', '家'], ['q', '去'], ['x', '西'], ['z', '字'], ['c', '次'], ['s', '思'], ['r', '日'], ['y', '一'], ['w', '我']].map(([pinyin, hanzi]) => ({ pinyin, hanzi })), target: 'bpmfdtnlgkhjqxzcsryw' },
    { level: '第二关', title: '音节练习', selector: '韵母', syllables: [['a', '啊'], ['e', '鹅'], ['i', '衣'], ['o', '喔'], ['u', '乌'], ['v', '鱼'], ['b', '波'], ['p', '坡'], ['m', '摸'], ['f', '佛']].map(([pinyin, hanzi]) => ({ pinyin, hanzi })), target: 'aeiouvbpmf' },
    { level: '第二关', title: '音节练习', selector: '整体认读', syllables: [['z', '字'], ['c', '次'], ['s', '思'], ['r', '日'], ['y', '一'], ['w', '我'], ['h', '喝'], ['j', '家'], ['q', '去'], ['x', '西']].map(([pinyin, hanzi]) => ({ pinyin, hanzi })), target: 'zcsrywhjqx' }
  ],
  'pinyin-word': [
    { level: '第三关', title: '词组练习', selector: '二字词1', lines: ['阿爸 阿斗 阿飞 阿胶 阿拉 阿里 阿婆 阿姨 埃及 挨边', '挨次 挨打 挨到 挨饿 挨个 挨过 挨肩 挨近 挨骂 挨整 挨着', '挨挨 哎呀 哎哟 癌变 癌病 癌症 艾草 艾虎 艾蓬 艾绒 艾蒿', '碍口 碍难 碍事 碍眼 碍于 爱称 爱戴 爱得 爱玩 爱国 爱好', '爱河 爱护 爱怜 爱恋 安生 安适 安睡 安泰 安恬 安妥 安危'] },
    { level: '第三关', title: '词组练习', selector: '二字词2', lines: ['白云 白天 白纸 白发 百姓 百年 百花 班级 办法 半岛 半夜', '包子 包含 保安 保持 报纸 杯子 北方 北京 被子 本来 本领', '比赛 比较 笔记 必须 变化 变成 表达 表面 表演 标准 标题', '冰雪 病人 不是 不同 部分 才能 参加 草地 产生 长大 常常 成功', '城市 成为 诚实 迟到 吃饭 出发 出门 出现 春天 词语 从前'] },
    { level: '第三关', title: '词组练习', selector: '二字词3', lines: ['大学 大家 大门 大脑 带来 代表 单位 当时 道路 到处 得到 地方', '电脑 电视 电影 东西 动物 读书 短信 对话 多么 儿童 耳朵', '发现 发展 方法 方向 房间 放心 分钟 丰富 风景 负责 复习', '刚才 高兴 高校 告诉 工作 公园 关闭 关系 关心 观察 管理', '国家 海边 海洋 好看 合作 黑色 红色 后来 花朵 画画 环境'] }
  ],
  'pinyin-article': [
    { level: '第四关', title: '文章练习', selector: '童趣', lines: ['余忆童稚时，能张目对日，明察秋毫，见藐小之物必细察其纹理，故时有物', '外之趣。', '夏蚊成雷，私拟作群鹤舞于空中，心之所向，则或千或百，果然鹤也；昂首', '观之，项为之强又留蚊于素帐中，徐喷以烟，使之冲烟而飞鸣，作青云白鹤', '观，果如鹤唳云端，为之怡然称快。'] },
    { level: '第四关', title: '文章练习', selector: '校园生活', lines: ['清晨的校园刚刚醒来，教学楼前的树叶还挂着露水。第一缕阳光穿过窗户，', '落在整齐的课桌上。同学们背着书包走进教室，新的学习任务就这样开始。', '上课时我们认真听讲，遇到问题先独立思考，再和同学交流自己的想法。', '课间可以让眼睛休息片刻，也可以整理笔记，为下一次练习做好准备。'] },
    { level: '第四关', title: '文章练习', selector: '山水广西', lines: ['广西的山水有一种舒展而明亮的气质。清晨的江面升起薄雾，远处的山峰在', '水光中若隐若现，小船缓缓经过，划开一条安静的波纹。城市醒来以后，', '街巷里渐渐热闹起来，米粉店飘出香气，人们用熟悉的乡音互相问候。', '年轻人学习知识、掌握技能，再把新的想法带回家乡，让生活不断向前。'] }
  ]
};
Object.entries(extraPinyinCopy).forEach(([lessonPage, lessons]) => pinyinCopy[lessonPage].push(...lessons));
expandPracticeBank(englishCopy, pinyinCopy);
pinyinCopy['pinyin-syllable'] = pinyinCopy['pinyin-syllable'].map((lesson) => {
  const minimumLength = 20;
  if (!lesson.target || lesson.target.length >= minimumLength || !lesson.syllables?.length) return lesson;
  const syllables = Array.from({ length: minimumLength }, (_, index) => lesson.syllables[index % lesson.syllables.length]);
  return { ...lesson, syllables, target: syllables.map((item) => item.pinyin).join('') };
});
const pinyinLesson = computed(() => {
  const lessons = pinyinCopy[page.value] || [];
  return lessons[pinyinLessonIndex[page.value] % Math.max(1, lessons.length)] || null;
});
const pinyinTarget = computed(() => pinyinLesson.value?.target || pinyinLesson.value?.lines?.join('') || '');
const pinyinTypedCharacters = computed(() => Array.from(pinyinInput.value));
const pinyinCorrect = computed(() => pinyinTypedCharacters.value.reduce((total, char, index) => total + (char === pinyinTarget.value[index] ? 1 : 0), 0));
const pinyinAccuracy = computed(() => pinyinTypedCharacters.value.length ? Math.round((pinyinCorrect.value / pinyinTypedCharacters.value.length) * 100) : 100);
const pinyinProgress = computed(() => Math.min(100, Math.round((pinyinTypedCharacters.value.length / Math.max(1, pinyinTarget.value.length)) * 100)));
const pinyinSpeed = computed(() => practiceElapsed.value ? Math.round(pinyinCorrect.value / (practiceElapsed.value / 60000)) : 0);
const pinyinLines = computed(() => {
  let offset = 0;
  return (pinyinLesson.value?.lines || []).map((line) => {
    const segment = { line, offset };
    offset += line.length;
    return segment;
  });
});
const pinyinSyllableItems = computed(() => {
  let offset = 0;
  return (pinyinLesson.value?.syllables || []).map((item, absoluteIndex) => {
    const result = { ...item, absoluteIndex, offset };
    offset += item.pinyin.length;
    return result;
  });
});
const pinyinInputSegments = computed(() => {
  if (page.value !== 'pinyin-syllable') return pinyinLines.value;
  return Array.from({ length: Math.ceil(pinyinSyllableItems.value.length / 5) }, (_, index) => {
    const group = pinyinSyllableItems.value.slice(index * 5, index * 5 + 5);
    return { offset: group[0].offset, line: group.map((item) => item.pinyin).join('') };
  });
});
const pinyinCurrentSyllableIndex = computed(() => {
  const index = pinyinSyllableItems.value.findIndex((item) => pinyinTypedCharacters.value.length < item.offset + item.pinyin.length);
  return index < 0 ? Math.max(0, pinyinSyllableItems.value.length - 1) : index;
});
const pinyinSyllableStart = computed(() => {
  const items = pinyinSyllableItems.value;
  return Math.min(Math.floor(pinyinCurrentSyllableIndex.value / 5) * 5, Math.max(0, items.length - 5));
});
const pinyinVisibleSyllables = computed(() => pinyinSyllableItems.value.slice(pinyinSyllableStart.value, pinyinSyllableStart.value + 5));
function pinyinSyllableClass(item) {
  const entered = pinyinTypedCharacters.value.slice(item.offset, item.offset + item.pinyin.length);
  const wrong = entered.some((char, index) => char !== item.pinyin[index]);
  return { wrong, correct: entered.length === item.pinyin.length && !wrong, current: pinyinTypedCharacters.value.length >= item.offset && pinyinTypedCharacters.value.length < item.offset + item.pinyin.length };
}
const pinyinCurrentCode = computed(() => {
  if (page.value !== 'pinyin-syllable') return '';
  const char = pinyinTarget.value[pinyinTypedCharacters.value.length] || '';
  return /[a-z]/i.test(char) ? 'Key' + char.toUpperCase() : '';
});
const englishCurrentCode = computed(() => {
  const char = englishTarget.value[englishTypedCharacters.value.length] || '';
  if (/[a-z]/i.test(char)) return 'Key' + char.toUpperCase();
  if (/[0-9]/.test(char)) return 'Digit' + char;
  return { ' ': 'Space', ',': 'Comma', '.': 'Period', '?': 'Slash', "'": 'Quote', ';': 'Semicolon' }[char] || '';
});
// 倒计时阶段 startedAt 还在未来，用 startedAt 当前沿，剩余时间固定显示 60
const challengeRemaining = computed(() => {
  if (!challenge.value) return 60;
  const from = Math.max(now.value, challenge.value.startedAt);
  return Math.max(0, Math.min(60, Math.ceil((challenge.value.expiresAt - from) / 1000)));
});
const countingDown = computed(() => challengeCountdown.value > 0);
const activeChallengeMode = computed(() => challenge.value?.mode || (page.value === 'challenge-english' ? 'english' : 'pinyin'));
const activeChallengeLabel = computed(() => activeChallengeMode.value === 'english' ? '英文挑战' : '拼音挑战');
const challengeTargetCharacters = computed(() => Array.from(challenge.value?.passage?.content || ''));
const challengeTypedCharacters = computed(() => Array.from(challengeInput.value));
const challengeScoreTarget = computed(() => challengeTargetCharacters.value.filter((char) => !/\s/u.test(char)));
const challengeScoreTyped = computed(() => challengeTypedCharacters.value.filter((char) => !/\s/u.test(char)));
const challengeScore = computed(() => challengeScoreTyped.value.reduce((total, char, index) => total + (char === challengeScoreTarget.value[index] ? 1 : 0), 0));
const challengeAccuracy = computed(() => challengeScoreTyped.value.length ? Math.round((challengeScore.value / challengeScoreTyped.value.length) * 100) : 100);
const challengeElapsed = computed(() => challenge.value ? Math.min(60_000, Math.max(0, now.value - challenge.value.startedAt)) : 0);
const challengeSpeed = computed(() => challengeElapsed.value ? Math.round(challengeScore.value / (challengeElapsed.value / 60_000)) : 0);
const challengeArticleLines = computed(() => {
  const text = challenge.value?.passage?.content || '';
  const chars = Array.from(text);
  const maxLength = activeChallengeMode.value === 'english' ? 64 : 38;
  const lines = [];
  let offset = 0;
  while (offset < chars.length) {
    let end = Math.min(offset + maxLength, chars.length);
    if (activeChallengeMode.value === 'english' && end < chars.length) {
      const breakOffset = text.lastIndexOf(' ', end);
      if (breakOffset > offset + Math.floor(maxLength * 0.55)) end = breakOffset + 1;
    }
    lines.push({ line: chars.slice(offset, end).join(''), offset });
    offset = end;
  }
  return lines;
});
const challengeVisibleArticleLines = computed(() => {
  const pageSize = 5;
  const lines = challengeArticleLines.value;
  let start = 0;
  while (start + pageSize < lines.length && challengeTypedCharacters.value.length >= lines[start + pageSize].offset) start += pageSize;
  return lines.slice(start, start + pageSize);
});
const challengeArticlePage = computed(() => {
  const total = Math.max(1, Math.ceil(challengeArticleLines.value.length / 5));
  const firstOffset = challengeVisibleArticleLines.value[0]?.offset || 0;
  const lineIndex = challengeArticleLines.value.findIndex((line) => line.offset === firstOffset);
  return { current: Math.floor(Math.max(0, lineIndex) / 5) + 1, total };
});
const beginnerVisibleSequence = computed(() => {
  const start = Math.min(Math.floor(beginnerIndex.value / 8) * 8, Math.max(0, beginnerSequence.value.length - 8));
  return beginnerSequence.value.slice(start, start + 8).map((item, offset) => ({ ...item, absoluteIndex: start + offset }));
});
const diagnosticTargetCharacters = computed(() => Array.from(diagnosticDrill.target));
const diagnosticTypedCharacters = computed(() => Array.from(diagnosticInput.value));
const diagnosticCorrect = computed(() => diagnosticTypedCharacters.value.reduce((total, char, index) => total + (char === diagnosticTargetCharacters.value[index] ? 1 : 0), 0));
const diagnosticAccuracy = computed(() => diagnosticTypedCharacters.value.length ? Math.round(diagnosticCorrect.value / diagnosticTypedCharacters.value.length * 100) : 100);
const diagnosticProgress = computed(() => Math.min(100, Math.round(diagnosticTypedCharacters.value.length / Math.max(1, diagnosticTargetCharacters.value.length) * 100)));
const keyLabelByCode = computed(() => Object.fromEntries(keyboard.map((key) => [key.code, key.label || key.secondary || key.code])));
function keyCodeForChar(char) {
  if (!char) return '';
  if (/[a-z]/i.test(char)) return `Key${char.toUpperCase()}`;
  if (/[0-9]/.test(char)) return `Digit${char}`;
  return { ' ': 'Space', ',': 'Comma', '.': 'Period', '?': 'Slash', '!': 'Digit1', "'": 'Quote', ';': 'Semicolon', ':': 'Semicolon', '-': 'Minus', '_': 'Minus' }[char] || `Char:${char}`;
}
function resetKeyStats() { activeKeyStats.clear(); }
function trackExpectedKey(expectedKey, actualKey, isCorrect) {
  // 汉字等非物理按键的目标（keyCodeForChar 会返回 Char:阿）没有对应键位，
  // 记进诊断只会产生无效的“键”，这里直接跳过。
  if (!expectedKey || expectedKey.startsWith('Char:')) return;
  const row = activeKeyStats.get(expectedKey) || { keyCode: expectedKey, expectedCount: 0, correctCount: 0, wrongCount: 0, actualErrors: {} };
  row.expectedCount += 1;
  if (isCorrect) row.correctCount += 1;
  else {
    row.wrongCount += 1;
    if (actualKey) row.actualErrors[actualKey] = (row.actualErrors[actualKey] || 0) + 1;
  }
  activeKeyStats.set(expectedKey, row);
}
// 输入法组字期间（含组字起始键的 keyCode 229）不能拦截按键、也不能手动写入模型，
// 否则原始拼音字母会和输入法提交的汉字重复计入同一次输入。
function isImeComposing(event) {
  return Boolean(event?.isComposing) || event?.keyCode === 229;
}
// 透明输入框本身不可见，但输入法候选框是跟随它的光标的。
// 把它铺在当前正在输入的那一行上，候选框才会出现在学生视线所在的位置。
function activeLineIndex(lines, typedCount) {
  const index = lines.findIndex((segment) => typedCount >= segment.offset && typedCount <= segment.offset + segment.line.length);
  return index < 0 ? lines.length - 1 : index;
}
function anchorCaptureInput(anchorEl, inputEl, lineSelector, index) {
  const anchor = anchorEl.value;
  const input = inputEl.value;
  if (!anchor || !input) return;
  const blocks = anchor.querySelectorAll(lineSelector);
  if (!blocks.length) return;
  const line = blocks[Math.min(Math.max(index, 0), blocks.length - 1)];
  input.style.top = `${line.offsetTop}px`;
  input.style.left = `${line.offsetLeft}px`;
  input.style.width = `${line.offsetWidth}px`;
  input.style.height = `${line.offsetHeight}px`;
}
function positionChallengeCapture() {
  anchorCaptureInput(
    challengeAnchorEl,
    challengeInputEl,
    '.challenge-typed-line',
    activeLineIndex(challengeVisibleArticleLines.value, challengeTypedCharacters.value.length)
  );
}
function repositionCaptureInputs() { positionChallengeCapture(); }
// flush:'post' 保证在可见行重排之后再量取位置，否则换行时锚点会落后一帧。
watch([challengeInput, () => challenge.value?.sessionId], () => positionChallengeCapture(), { flush: 'post' });
function diagnosticKeyCodes() {
  const codes = (learningDiagnostics.value?.recommendedKeys || []).map((row) => row.keyCode).filter(Boolean);
  return codes.length ? codes : ['KeyA', 'KeyS', 'KeyD', 'KeyF'];
}
function diagnosticKeys() { return diagnosticKeyCodes().map((code) => keyLabelByCode.value[code] || code.replace(/^Key/, '')).filter(Boolean); }
function diagnosticCharacterForCode(code) {
  if (code === 'Space') return ' ';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\' }[code] || '';
}
function buildDiagnosticText() {
  const characters = diagnosticKeyCodes().map(diagnosticCharacterForCode).filter((char) => char.length);
  if (!characters.length) return 'asdf'.repeat(18);
  return Array.from({ length: 72 }, (_, index) => characters[index % characters.length]).join('');
}
function diagnosticCharClass(index, char) {
  const typedChar = diagnosticTypedCharacters.value[index];
  return { correct: index < diagnosticTypedCharacters.value.length && typedChar === char, wrong: index < diagnosticTypedCharacters.value.length && typedChar !== char, current: index === diagnosticTypedCharacters.value.length };
}
function assignmentStatusLabel(status) { return ({ pending: '待开始', in_progress: '进行中', completed: '已完成', overdue: '已逾期' })[status] || status; }
function assignmentModeLabel(mode) { return ({ all: '所有课程', beginner: '新手入门', 'english-word': '英文单词', 'english-phrase': '英文语句', 'english-article': '英文文章', 'pinyin-syllable': '拼音音节', 'pinyin-word': '拼音词组', 'pinyin-article': '拼音文章' })[mode] || mode; }
function openAssignment(task) {
  if (task.status === 'completed') return;
  if (task.mode === 'beginner') return openBeginner();
  if (task.mode.startsWith('english-')) return openEnglishLesson(task.mode);
  if (task.mode.startsWith('pinyin-')) return openPinyinLesson(task.mode);
  return openBeginner();
}
function clearBeginnerFeedback() { window.clearTimeout(wrongFeedbackTimer); wrongCode.value = null; wrongNotice.value = ''; }
function showBeginnerWrongFeedback(event) { window.clearTimeout(wrongFeedbackTimer); wrongCode.value = event.code; wrongNotice.value = `按错了，请按 ${beginnerTarget.value.label}（${handTargetMeta.value.label}）· ${handTargetMeta.value.action}`; wrongFeedbackTimer = window.setTimeout(clearBeginnerFeedback, 1200); }
function clearPracticeAdvance() { window.clearTimeout(practiceAdvanceTimer); practiceCompleteNotice.value = ''; }
function makeBeginnerSequence(advance = false) {
  clearPracticeAdvance();
  if (advance) beginnerLessonIndex.value = (beginnerLessonIndex.value + 1) % beginnerLessons.length;
  savePracticeIndex('beginner', beginnerLessonIndex.value);
  const items = [...beginnerLesson.value.items];
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  beginnerSequence.value = items; beginnerIndex.value=0; beginnerCorrect.value=0; beginnerWrong.value=0;
  beginnerStartedAt.value=null; beginnerCompleted.value=false; now.value=Date.now(); resetKeyStats(); clearBeginnerFeedback();
}
function selectBeginnerLesson(index) { beginnerLessonIndex.value = Number(index); makeBeginnerSequence(false); }
function schedulePracticeAdvance(kind) {
  if (practiceCompleteNotice.value) return;
  const lessonPage = page.value;
  practiceCompleteNotice.value = kind === 'beginner' ? '本关完成，正在进入下一关…' : '本套完成，正在加载下一套练习…';
  practiceAdvanceTimer = window.setTimeout(() => {
    if (page.value !== lessonPage) return clearPracticeAdvance();
    if (kind === 'beginner') makeBeginnerSequence(true);
    else if (kind === 'english') resetEnglishLesson(lessonPage, true);
    else resetPinyinLesson(lessonPage, true);
  }, 1100);
}

const recordedTrainingRuns = new Set();
function compareTrainingText(input, target) {
  const entered = Array.from(input); const expected = Array.from(target);
  const correct = entered.reduce((total, char, index) => total + (char === expected[index] ? 1 : 0), 0);
  return { correct, wrong: Math.max(0, entered.length - correct) };
}
function recordTrainingSession({ mode, lessonTitle, correctChars, wrongChars, startedAt, keyStats = Array.from(activeKeyStats.values()) }) {
  if (!user.value || !startedAt || correctChars < 1) return;
  const durationMs = Math.max(1000, Date.now() - startedAt);
  const key = `${mode}:${lessonTitle}:${startedAt}`;
  if (recordedTrainingRuns.has(key)) return;
  recordedTrainingRuns.add(key);
  requestJSON('/api/training-sessions', {
    method: 'POST', body: JSON.stringify({ mode, lessonTitle, correctChars, wrongChars, durationMs, keyStats })
  }).then(() => loadLearningData()).catch(() => recordedTrainingRuns.delete(key));
}
async function loadPassage() { const res = await fetch('/api/passages?category=' + encodeURIComponent(category.value) + '&random=1'); const data = await res.json(); passage.value=data.passages?.[0] || null; typed.value=''; }
async function requestJSON(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '请求失败，请稍后重试');
  return data;
}
async function loadCurrentUser() {
  try {
    const data = await requestJSON('/api/auth/me');
    user.value = data.authenticated ? data.user : null;
  } catch {
    user.value = null;
  }
}
async function loadLearningData() {
  if (!user.value) { learningSummary.value = null; learningDiagnostics.value = null; assignments.value = []; return; }
  learningLoading.value = true;
  try {
    const [summary, diagnostics, assignmentData] = await Promise.all([
      requestJSON('/api/learning/summary'),
      requestJSON('/api/learning/diagnostics'),
      requestJSON('/api/assignments')
    ]);
    learningSummary.value = summary;
    learningDiagnostics.value = diagnostics;
    assignments.value = assignmentData.rows || [];
  } catch {
    learningSummary.value = null;
    learningDiagnostics.value = null;
    assignments.value = [];
  } finally { learningLoading.value = false; }
}
function openAccount() {
  authMessage.value = '';
  avatarMessage.value = '';
  authView.value = user.value ? 'profile' : 'login';
  authOpen.value = true;
}
function optimizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('头像读取失败，请重新选择图片'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('图片无法解析，请选择常见图片格式'));
      image.onload = () => {
        const size = 192; const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
        const context = canvas.getContext('2d'); const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
        const sx = ((image.naturalWidth || image.width) - side) / 2; const sy = ((image.naturalHeight || image.height) - side) / 2;
        context.drawImage(image, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', .82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function uploadAvatar(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) { avatarMessage.value = '请选择图片文件'; return; }
  if (file.size > 5 * 1024 * 1024) { avatarMessage.value = '原始图片不能超过 5MB'; return; }
  avatarBusy.value = true; avatarMessage.value = '';
  try {
    const avatarData = await optimizeAvatar(file);
    const data = await requestJSON('/api/auth/avatar', { method: 'PATCH', body: JSON.stringify({ avatarData }) });
    user.value = data.user;
    avatarMessage.value = '头像已更新，进入占领战后会同步显示。';
  } catch (error) { avatarMessage.value = error.message; }
  finally { avatarBusy.value = false; }
}
async function submitLogin() {
  authBusy.value = true; authMessage.value = '';
  try {
    const data = await requestJSON('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) });
    user.value = data.user;
    authView.value = 'login';
    loginForm.password = '';
    authMessage.value = '';
    authOpen.value = false;
    setPage('home');
    loadLearningData();
  } catch (error) { authMessage.value = error.message; }
  finally { authBusy.value = false; }
}
async function submitRegister() {
  authMessage.value = '';
  authBusy.value = true;
  try {
    const data = await requestJSON('/api/auth/register', { method: 'POST', body: JSON.stringify({ displayName: registerForm.displayName, password: registerForm.password }) });
    if (data.pending) {
      authMessage.value = data.message;
      authView.value = 'login';
      loginForm.username = registerForm.displayName;
    } else {
      user.value = data.user; authView.value = 'profile'; authMessage.value = '账号创建成功。'; loadLearningData();
    }
    registerForm.displayName = ''; registerForm.password = '';
  } catch (error) { authMessage.value = error.message; }
  finally { authBusy.value = false; }
}
async function logout() {
  authBusy.value = true;
  try { await requestJSON('/api/auth/logout', { method: 'POST' }); user.value = null; learningSummary.value = null; learningDiagnostics.value = null; assignments.value = []; authView.value = 'login'; authOpen.value = false; }
  finally { authBusy.value = false; }
}
function persistChallenge() {
  if (!challenge.value) return;
  localStorage.setItem(challengeStorageKey, JSON.stringify({ ...challenge.value, typedText: challengeInput.value }));
}
function restoreChallenge() {
  try {
    const saved = JSON.parse(localStorage.getItem(challengeStorageKey));
    if (!saved?.sessionId || !user.value || saved.userId !== user.value.id || Date.now() > saved.expiresAt + 600000) {
      localStorage.removeItem(challengeStorageKey);
      return;
    }
    challenge.value = saved;
    challengeMode.value = saved.mode === 'english' ? 'english' : 'pinyin';
    challengeInput.value = saved.typedText || '';
    setPage(`challenge-${challengeMode.value}`);
    nextTick(() => challengeInputEl.value?.focus());
  } catch { localStorage.removeItem(challengeStorageKey); }
}
// 首页/挑战首页点卡片：只切到挑战页，先给用户看介绍和「开始挑战」按钮，不建会话
function openChallengeMode(nextMode = 'pinyin') {
  challengeMode.value = nextMode === 'english' ? 'english' : 'pinyin';
  challengeResult.value = null;
  stopChallengeCountdown();
  setPage(`challenge-${challengeMode.value}`);
}

function stopChallengeCountdown() {
  if (challengeCountdownTimer) clearInterval(challengeCountdownTimer);
  challengeCountdownTimer = null;
  challengeCountdown.value = 0;
}

// 倒计时长度直接取服务端 startedAt 与本地时间的差，自动扣掉请求往返延迟
function runChallengeCountdown(milliseconds) {
  stopChallengeCountdown();
  const total = Math.max(0, milliseconds);
  if (!total) { focusChallengeInput(); return; }
  challengeCountdown.value = Math.ceil(total / 1000);
  const startedAt = Date.now();
  challengeCountdownTimer = setInterval(() => {
    const left = total - (Date.now() - startedAt);
    challengeCountdown.value = Math.max(0, Math.ceil(left / 1000));
    if (left <= 0) {
      stopChallengeCountdown();
      focusChallengeInput();
    }
  }, 80);
}

async function startChallenge(nextMode = challengeMode.value) {
  challengeMode.value = nextMode === 'english' ? 'english' : 'pinyin';
  challengeResult.value = null;
  if (!user.value) { authView.value = 'login'; authOpen.value = true; authMessage.value = '请先登录，成绩才能计入排行榜。'; return; }
  challengeSubmitting.value = true;
  try {
    const data = await requestJSON('/api/challenges', { method: 'POST', body: JSON.stringify({ mode: challengeMode.value, startInMs: challengeCountdownMs }) });
    challenge.value = { ...data, mode: data.mode || challengeMode.value, userId: user.value.id };
    challengeInput.value = '';
    setPage(`challenge-${challenge.value.mode}`);
    persistChallenge();
    runChallengeCountdown(challenge.value.startedAt - Date.now());
  } catch (error) { authMessage.value = error.message; }
  finally { challengeSubmitting.value = false; }
}
async function submitChallenge() {
  if (!challenge.value || challengeSubmitting.value) return;
  challengeSubmitting.value = true;
  try {
    const data = await requestJSON('/api/challenges/' + challenge.value.sessionId + '/submit', { method: 'POST', body: JSON.stringify({ typedText: challengeInput.value }) });
    challengeResult.value = data;
    challenge.value = null;
    localStorage.removeItem(challengeStorageKey);
    loadLeaderboard(activeChallengeMode.value);
  } catch (error) {
    if (error.message.includes('尚未结束')) return;
    challengeResult.value = { error: error.message };
  } finally { challengeSubmitting.value = false; }
}
async function loadLeaderboard(mode = null) {
  try {
    const modeQuery = mode === 'english' || mode === 'pinyin' ? `&mode=${encodeURIComponent(mode)}` : '';
    const data = await requestJSON('/api/leaderboard?period=all&limit=10' + modeQuery);
    leaderboardRows.value = data.rows;
    Object.assign(leaderboardTotals, data.totals);
  } catch {
    leaderboardRows.value = [];
  }
}
async function loadChallengeLeaderboards() {
  challengeLeaderboardLoading.value = true;
  await Promise.all(Object.keys(challengeLeaderboards).map(async (mode) => {
    try {
      const data = await requestJSON('/api/leaderboard?period=all&limit=10&mode=' + encodeURIComponent(mode));
      challengeLeaderboards[mode].rows = data.rows || [];
      Object.assign(challengeLeaderboards[mode].totals, data.totals || {});
    } catch {
      challengeLeaderboards[mode].rows = [];
    }
  }));
  challengeLeaderboardLoading.value = false;
}
async function openLeaderboard() { await loadLeaderboard(); leaderboardOpen.value = true; }
function openChallengePage() { challengeResult.value = null; challengeMode.value = 'pinyin'; stopChallengeCountdown(); setPage('challenge-home'); loadChallengeLeaderboards(); }
function focusChallengeInput() { nextTick(() => { positionChallengeCapture(); challengeInputEl.value?.focus(); }); }
function challengeTypedLine(segment) { return challengeTypedCharacters.value.slice(segment.offset, segment.offset + segment.line.length); }
function challengeCaretVisible(segment) { return challengeTypedCharacters.value.length >= segment.offset && challengeTypedCharacters.value.length <= segment.offset + segment.line.length; }
function setPage(nextPage) { page.value = nextPage; window.location.hash = nextPage === 'home' ? '' : nextPage; }
function goHome() { setPage('home'); passage.value=null; typed.value=''; practiceStartedAt.value=null; }
function openGrowth() { if (!user.value) { openAccount(); return; } authOpen.value = false; if (!learningSummary.value) loadLearningData(); setPage('growth'); }
function openDiagnostics() { if (!user.value) { openAccount(); return; } authOpen.value = false; if (!learningDiagnostics.value) loadLearningData(); setPage('diagnostics'); }
function openDiagnosticDrill() {
  if (!user.value) { openAccount(); return; }
  const keys = diagnosticKeys();
  diagnosticDrill.title = `错键专项 · ${keys.join(' / ')}`;
  diagnosticDrill.target = buildDiagnosticText();
  diagnosticDrill.startedAt = null;
  diagnosticDrill.completed = false;
  diagnosticInput.value = '';
  diagnosticLastTrackedLength.value = 0;
  resetKeyStats();
  setPage('diagnostic-drill');
  nextTick(() => diagnosticInputEl.value?.focus());
}
function handleDiagnosticInput(event) {
  diagnosticInput.value = Array.from(event.target.value || '').slice(0, diagnosticTargetCharacters.value.length).join('');
  if (!diagnosticInput.value.length) return;
  if (!diagnosticDrill.startedAt) diagnosticDrill.startedAt = Date.now();
  const typedChars = diagnosticTypedCharacters.value;
  while (diagnosticLastTrackedLength.value < typedChars.length) {
    const index = diagnosticLastTrackedLength.value;
    const expected = diagnosticTargetCharacters.value[index] || '';
    const actual = typedChars[index] || '';
    trackExpectedKey(keyCodeForChar(expected), keyCodeForChar(actual), actual === expected);
    diagnosticLastTrackedLength.value += 1;
  }
  if (typedChars.length >= diagnosticTargetCharacters.value.length && !diagnosticDrill.completed) {
    diagnosticDrill.completed = true;
    recordTrainingSession({ mode: 'beginner', lessonTitle: diagnosticDrill.title, correctChars: diagnosticCorrect.value, wrongChars: Math.max(0, typedChars.length - diagnosticCorrect.value), startedAt: diagnosticDrill.startedAt });
  }
}
function goEnglishHome() { setPage('english-home'); resetEnglishLesson(); }
function openPractice(next) { category.value=next; if (next === '英文打字') { setPage('english-home'); } else if (next === '拼音打字') { setPage('pinyin-home'); } else { setPage('practice'); loadPassage(); } }
function openBeginner() { setPage('beginner'); makeBeginnerSequence(false); }
function advanceLesson(indexes, catalog, lessonPage) { const lessons = catalog[lessonPage] || []; if (lessons.length > 1) { indexes[lessonPage] = (indexes[lessonPage] + 1) % lessons.length; savePracticeIndex(lessonPage, indexes[lessonPage]); } }
function openEnglishLesson(nextPage) { setPage(nextPage); resetEnglishLesson(nextPage, false); }
function resetEnglishLesson(nextPage = page.value, advance = true) { clearPracticeAdvance(); if (advance) advanceLesson(englishLessonIndex, englishCopy, nextPage); typed.value=''; practiceStartedAt.value=null; now.value=Date.now(); resetKeyStats(); }
function selectEnglishLesson(index) { englishLessonIndex[page.value]=Number(index); savePracticeIndex(page.value, englishLessonIndex[page.value]); resetEnglishLesson(page.value,false); }
function englishCharClass(index, char) {
  const typedChar = englishTypedCharacters.value[index];
  return { correct: index < typed.value.length && typedChar === char, wrong: index < typed.value.length && typedChar !== char, current: index === typed.value.length };
}
function englishTypedCharClass(index, char) { return { correct: char === englishTarget.value[index], wrong: char !== englishTarget.value[index] }; }
function englishArticleTypedLine(segment) { return englishTypedCharacters.value.slice(segment.offset, segment.offset + segment.line.length); }
function englishArticleCaretVisible(segment) { return englishTypedCharacters.value.length >= segment.offset && englishTypedCharacters.value.length <= segment.offset + segment.line.length; }
function autoAdvanceEnglishBoundary() {
  const typedLength = englishTypedCharacters.value.length;
  const atBoundary = englishInlineSegments.value.some((segment) => segment.offset + segment.line.length === typedLength);
  if (!atBoundary) return;
  while (typed.value.length < englishTarget.value.length && /\s/.test(englishTarget.value[typed.value.length] || '')) {
    typed.value += englishTarget.value[typed.value.length];
  }
}
function pinyinCharClass(index, char) { const typedChar = pinyinTypedCharacters.value[index]; return { correct: index < pinyinTypedCharacters.value.length && typedChar === char, wrong: index < pinyinTypedCharacters.value.length && typedChar !== char, current: index === pinyinTypedCharacters.value.length }; }
function focusPinyinInput() { nextTick(() => pinyinInputEl.value?.focus()); }
function startPinyinPractice() { if (!practiceStartedAt.value) practiceStartedAt.value = Date.now(); nextTick(() => {
  if (pinyinInput.value.length >= pinyinTarget.value.length) {
    const result = compareTrainingText(pinyinInput.value, pinyinTarget.value);
    recordTrainingSession({ mode: page.value, lessonTitle: pinyinLesson.value?.selector || pinyinLesson.value?.title || '拼音练习', correctChars: result.correct, wrongChars: result.wrong, startedAt: practiceStartedAt.value });
    schedulePracticeAdvance('pinyin');
  }
}); }
function resetPinyinLesson(nextPage = page.value, advance = true) { clearPracticeAdvance(); if (advance) advanceLesson(pinyinLessonIndex, pinyinCopy, nextPage); pinyinInput.value = ''; practiceStartedAt.value = null; now.value = Date.now(); resetKeyStats(); if (nextPage.startsWith('pinyin-')) focusPinyinInput(); }
function selectPinyinLesson(index) { pinyinLessonIndex[page.value]=Number(index); savePracticeIndex(page.value, pinyinLessonIndex[page.value]); resetPinyinLesson(page.value,false); }
function openPinyinLesson(nextPage) { page.value = nextPage; window.location.hash = nextPage; resetPinyinLesson(nextPage, false); }
function handlePinyinKey(event) {
  if (!page.value.startsWith('pinyin-') || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  if (isImeComposing(event)) return;
  // Native input owns text, selection and IME. Observe physical keys only for diagnostics.
  if (pinyinInput.value.length >= pinyinTarget.value.length) return;
  const expected = pinyinTarget.value[pinyinInput.value.length] || '';
  const entered = event.code === 'Space' ? ' ' : (event.key?.length === 1 ? event.key.toLowerCase() : '');
  if (!entered) return;
  trackExpectedKey(keyCodeForChar(expected), event.code, entered === expected);
}
function handlePinyinVirtualKey(event) {
  handleKey(event);
  if (event.code === 'Backspace') pinyinInput.value = pinyinInput.value.slice(0, -1);
  else if (event.code === 'Space' && pinyinInput.value.length < pinyinTarget.value.length) {
    const expected = pinyinTarget.value[pinyinInput.value.length] || '';
    trackExpectedKey(keyCodeForChar(expected), event.code, expected === ' ');
    pinyinInput.value += ' ';
  } else if (event.key?.length === 1 && pinyinInput.value.length < pinyinTarget.value.length) {
    const expected = pinyinTarget.value[pinyinInput.value.length] || '';
    const entered = event.key.toLowerCase();
    trackExpectedKey(keyCodeForChar(expected), event.code, entered === expected);
    pinyinInput.value += entered;
  }
  startPinyinPractice();
  focusPinyinInput();
}
function keyClass(key) { return { pressed:pressedCode.value===key.code, target:(page.value==='beginner' && beginnerTarget.value.code===key.code) || (page.value.startsWith('english-') && englishCurrentCode.value===key.code) || (page.value.startsWith('pinyin-') && pinyinCurrentCode.value===key.code) }; }
function handleEnglishKey(event) {
  if (!page.value.startsWith('english-') || page.value === 'english-home') return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (isImeComposing(event)) return;
  if (event.code === 'Backspace' || event.code === 'Space') event.preventDefault?.();
  if (!practiceStartedAt.value) practiceStartedAt.value = Date.now();
  if (event.code === 'Backspace') typed.value = typed.value.slice(0, -1);
  else if (typed.value.length < englishTarget.value.length) {
    const expected = englishTarget.value[typed.value.length];
    let entered = event.code === 'Space' ? ' ' : (event.key?.length === 1 ? event.key : '');
    if (/[a-z]/.test(expected) && /[A-Z]/.test(entered)) entered = entered.toLowerCase();
    if (entered) {
      trackExpectedKey(keyCodeForChar(expected), event.code, entered === expected);
      typed.value += entered;
      autoAdvanceEnglishBoundary();
      if (typed.value.length >= englishTarget.value.length) {
        const result = compareTrainingText(typed.value, englishTarget.value);
        recordTrainingSession({ mode: page.value, lessonTitle: englishLesson.value?.selector || englishLesson.value?.title || '英文练习', correctChars: result.correct, wrongChars: result.wrong, startedAt: practiceStartedAt.value });
        schedulePracticeAdvance('english');
      }
    }
  }
}
function handleKey(event) {
  if (event.repeat) return;
  if (event.key==='Escape' && page.value==='games' && !authOpen.value && !leaderboardOpen.value) { goHome(); return; }
  pressedCode.value=event.code; lastCode.value=event.code;
  window.setTimeout(() => { if (pressedCode.value===event.code) pressedCode.value=null; }, 180);
  if (page.value==='beginner' && !beginnerCompleted.value) {
    if (!beginnerStartedAt.value) beginnerStartedAt.value=Date.now();
    if (event.code===beginnerTarget.value.code) {
      trackExpectedKey(beginnerTarget.value.code, event.code, true);
      beginnerCorrect.value+=1; beginnerIndex.value=Math.min(beginnerIndex.value+1, beginnerSequence.value.length); clearBeginnerFeedback();
      if (beginnerIndex.value >= beginnerSequence.value.length) {
        beginnerCompleted.value=true;
        recordTrainingSession({ mode: 'beginner', lessonTitle: beginnerLesson.value.title, correctChars: beginnerCorrect.value, wrongChars: beginnerWrong.value, startedAt: beginnerStartedAt.value });
        schedulePracticeAdvance('beginner');
      }
    } else { trackExpectedKey(beginnerTarget.value.code, event.code, false); beginnerWrong.value+=1; showBeginnerWrongFeedback(event); }
  }
  handleEnglishKey(event);
}
function updateInput(event) { typed.value=event.target.value; }
onMounted(async () => {
  makeBeginnerSequence();
  const savedPage = window.location.hash.slice(1);
  const allowedPages = ['games', 'competition', 'bug-feedback', 'boss', 'race', 'rhythm', 'chase', 'battle', 'runner', 'beginner', 'english-home', 'english-word', 'english-phrase', 'english-article', 'pinyin-home', 'pinyin-syllable', 'pinyin-word', 'pinyin-article', 'challenge-home', 'challenge-english', 'challenge-pinyin', 'practice', 'growth', 'diagnostics', 'diagnostic-drill'];
  if (savedPage === 'challenge') page.value = 'challenge-home';
  else if (allowedPages.includes(savedPage)) page.value = savedPage;
  if (['race', 'rhythm', 'chase', 'boss', 'battle'].includes(savedPage)) {
    window.location.hash = 'games';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#games`);
  }
  if (savedPage === 'practice') loadPassage();
  if (pinyinCopy[savedPage]) resetPinyinLesson(savedPage, false);
  if (savedPage === 'challenge-home') loadChallengeLeaderboards();
  await loadCurrentUser();
  await loadLearningData();
  restoreChallenge();
  loadLeaderboard();
  window.addEventListener('keydown', handleKey);
  window.addEventListener('resize', repositionCaptureInputs);
  repositionCaptureInputs();
  timer=window.setInterval(() => {
    now.value=Date.now();
    if (challenge.value && !challengeSubmitting.value && now.value >= challenge.value.expiresAt) submitChallenge();
  },250);
});
onBeforeUnmount(() => { window.removeEventListener('keydown', handleKey); window.removeEventListener('resize', repositionCaptureInputs); window.clearInterval(timer); window.clearTimeout(wrongFeedbackTimer); window.clearTimeout(practiceAdvanceTimer); stopChallengeCountdown(); });
</script>
<template>
<BattleGame v-if="page === 'battle'" :user="user" @back="setPage('games')" @leaderboard="openLeaderboard" @login="setPage('games'); openAccount()"/>
<BossGame v-else-if="page === 'boss'" :user="user" @back="setPage('games')" @leaderboard="openLeaderboard" @login="setPage('games'); openAccount()"/>
<ArenaGame v-else-if="page === 'race' || page === 'rhythm'" :key="page" :mode="page" :user="user" @back="setPage('games')" @leaderboard="openLeaderboard" @login="setPage('games'); openAccount()"/>
<ChaseGame v-else-if="page === 'chase'" :user="user" @back="setPage('games')" @login="setPage('games'); openAccount()"/>
<RunnerGame v-else-if="page === 'runner'" :user="user" @back="setPage('games')" @leaderboard="openLeaderboard" @login="setPage('games'); openAccount()"/>
<BugFeedback v-else-if="page === 'bug-feedback'" :user="user" @back="setPage('games')" @login="setPage('games'); openAccount()"/>
<CompetitionGame v-else-if="page === 'competition'" :user="user" @back="setPage('games')" @login="setPage('competition'); openAccount()"/>
<GameLobby v-else-if="page === 'games'" :user="user" @select="setPage" @back="goHome" @growth="openGrowth" @leaderboard="openLeaderboard" @account="openAccount" @bug-report="setPage('bug-feedback')"/>
<div v-else class="app-shell" :class="{ 'is-home-page': page === 'home', 'is-reference-page': page === 'beginner' || page === 'growth' || page === 'diagnostics' || page === 'diagnostic-drill' || page.startsWith('challenge-') || page.startsWith('english-') || page.startsWith('pinyin-'), 'is-beginner-page': page === 'beginner', 'is-english-home': page === 'english-home', 'is-english-practice': page.startsWith('english-') && page !== 'english-home', 'is-pinyin-practice': page.startsWith('pinyin-') && page !== 'pinyin-home', 'is-pinyin-home': page === 'pinyin-home', 'is-challenge-running': page.startsWith('challenge-') && !!challenge }"><AppHeader variant="hero" title="字练场 2026" subtitle="中文与英文键盘训练" :icon="KeyboardIcon" decor clickable-brand :user="user" @brand="goHome" @account="openAccount" />
  <main><section v-if="page==='home'" class="home-view"><div class="breadcrumb">首页 <b>›</b> <strong>选择打字课程</strong></div><section class="welcome"><div><p class="eyebrow">欢迎使用</p><h1>字练场 <em>2026</em></h1><p>零基础入门，轻松学打字</p></div></section><div class="home-cards"><button class="course-card orange" @click="openBeginner"><img class="home-course-icon" :src="'/assets/home-beginner.png'" alt="新手入门"/><strong>新手入门</strong><small>字幕键位练习，认识每个手指</small></button><button class="course-card blue" @click="openPractice('英文打字')"><img class="home-course-icon" :src="'/assets/home-english.png'" alt="英文打字"/><strong>英文打字</strong><small>单词、语句与文章练习</small></button><button class="course-card green" @click="openPractice('拼音打字')"><img class="home-course-icon" :src="'/assets/home-pinyin.png'" alt="拼音打字"/><strong>拼音打字</strong><small>练习拼音输入，提升中文速度</small></button><button class="course-card challenge" @click="openChallengePage"><span class="home-challenge-icon">60<small>秒</small></span><strong>挑战模式</strong><small>英文/拼音文章一分钟挑战</small></button><button class="course-card battle" @click="setPage('games')"><span class="home-challenge-icon">VS</span><strong>游戏模式</strong><small>六种游戏玩法，和同学一起挑战</small></button></div><p class="footnote">四种练习均可直接开始，登录后可保存一分钟挑战成绩并参与排行榜。</p><div class="home-tools"><button type="button" @click="openBeginner"><KeyboardIcon :size="16"/>打字教程</button><button type="button" @click="openChallengePage"><Timer :size="16"/>挑战模式</button><button type="button" @click="openLeaderboard"><BarChart3 :size="16"/>排行榜</button><template v-if="user"><button type="button" @click="openGrowth"><Target :size="16"/>我的成长</button><button type="button" @click="openDiagnostics"><AlertTriangle :size="16"/>错键诊断</button></template></div></section>
<section v-else-if="page === 'growth'" class="lesson-view learning-view">
  <div class="lesson-nav"><button @click="goHome"><ArrowLeft :size="14"/>返回</button><span>首页</span><b>›</b><strong>我的成长</strong></div>
  <section class="learning-hero"><div><p class="eyebrow">学生成长中心</p><h1>{{ user?.displayName || '同学' }}，继续保持输入节奏。</h1><p v-if="learningSummary?.hasData">当前阶段：{{ learningSummary.level.label }} · {{ learningSummary.level.next }}</p><p v-else>完成一次练习后，这里会开始记录你的成长轨迹。</p></div><div class="learning-level"><Flame :size="20"/><strong>{{ learningSummary?.stats?.streak || 0 }}</strong><span>连续练习天</span></div></section>
  <div v-if="learningLoading" class="learning-empty">正在加载成长数据…</div>
  <template v-else-if="learningSummary">
    <div class="learning-metrics"><article><span>练习次数</span><strong>{{ learningSummary.stats.sessions }}</strong><small>累计完成记录</small></article><article><span>本周练习</span><strong>{{ learningSummary.stats.weeklySessions }}</strong><small>{{ learningSummary.stats.weeklyMinutes }} 分钟</small></article><article><span>平均速度</span><strong>{{ learningSummary.stats.averageSpeed }}</strong><small>字 / 分</small></article><article><span>平均准确率</span><strong>{{ learningSummary.stats.averageAccuracy }}%</strong><small>最高速度 {{ learningSummary.stats.bestSpeed }}</small></article></div>
    <div class="learning-grid"><section class="learning-panel"><header><div><p class="eyebrow">最近趋势</p><h2>速度与准确率</h2></div><button type="button" class="learning-link" @click="openDiagnostics">查看薄弱项 <ArrowUpRight :size="14"/></button></header><div v-if="learningSummary.trend.length" class="trend-list"><div v-for="(item,index) in learningSummary.trend" :key="`${item.completedAt}-${index}`" class="trend-row"><span>{{ new Date(item.completedAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'}) }}</span><div><i :style="{width:`${Math.min(100, Math.max(4, item.speed / Math.max(1, learningSummary.stats.bestSpeed) * 100))}%`}"></i></div><strong>{{ item.speed }}</strong><small>{{ item.accuracy }}%</small></div></div><div v-else class="learning-empty compact">先完成一次课程练习，趋势图会在这里出现。</div></section><section class="learning-panel"><header><div><p class="eyebrow">薄弱键位</p><h2>下一步练什么</h2></div><button type="button" class="learning-link" @click="openDiagnosticDrill">开始专项练习 <ArrowUpRight :size="14"/></button></header><div v-if="learningSummary.diagnostics.length" class="weak-key-list"><div v-for="item in learningSummary.diagnostics" :key="item.keyCode" class="weak-key-row"><strong>{{ keyLabelByCode[item.keyCode] || item.keyCode }}</strong><div><i :style="{width:`${Math.min(100, Math.max(6, item.errorRate))}%`}"></i></div><span>{{ item.errorRate }}%</span></div></div><div v-else class="learning-empty compact">完成几次键位或课程练习后，会显示个性化薄弱项。</div></section></div>
    <section class="learning-panel assignments-panel"><header><div><p class="eyebrow">教师安排</p><h2>我的任务</h2></div><span class="assignment-count">{{ assignments.length }} 个任务</span></header><div v-if="assignments.length" class="assignment-list"><div v-for="task in assignments" :key="task.id" class="assignment-row"><div><strong>{{ task.title }}</strong><small>{{ assignmentModeLabel(task.mode) }}<template v-if="task.lessonTitle"> · {{ task.lessonTitle }}</template></small></div><span :class="`assignment-status ${task.status}`">{{ assignmentStatusLabel(task.status) }}</span><button v-if="task.status !== 'completed'" type="button" @click="openAssignment(task)">{{ task.status === 'overdue' ? '重新练习' : '继续练习' }}</button><small v-if="task.dueAt" class="assignment-due">截止 {{ new Date(task.dueAt).toLocaleDateString('zh-CN') }}</small></div></div><div v-else class="learning-empty compact">老师发布任务后，会显示在这里。</div></section>
    <section class="learning-panel recent-panel"><header><div><p class="eyebrow">最近训练</p><h2>每一次练习都会留下进步</h2></div><button type="button" class="learning-link" @click="openDiagnostics"><ListChecks :size="14"/>错键诊断</button></header><div v-if="learningSummary.recent.length" class="recent-training-list"><div v-for="item in learningSummary.recent" :key="`${item.completedAt}-${item.lessonTitle}`"><span>{{ item.lessonTitle }}</span><strong>{{ item.speed }} 字/分</strong><small>{{ item.accuracy }}% · {{ Math.round(item.durationMs / 60000 * 10) / 10 }} 分钟</small></div></div><div v-else class="learning-empty compact">还没有训练记录。</div></section>
  </template>
</section>

<section v-else-if="page === 'diagnostics'" class="lesson-view learning-view">
  <div class="lesson-nav"><button @click="openGrowth"><ArrowLeft :size="14"/>返回成长</button><span>我的成长</span><b>›</b><strong>错键诊断</strong></div>
  <section class="diagnostic-hero"><div><p class="eyebrow">个性化诊断</p><h1>把最容易错的键，练成最熟的键。</h1><p>系统根据你的训练记录计算目标键错误率。数据只绑定当前学生账号。</p></div><button type="button" class="diagnostic-primary" @click="openDiagnosticDrill"><Target :size="16"/>开始专项练习</button></section>
  <div v-if="learningLoading" class="learning-empty">正在分析训练数据…</div>
  <template v-else-if="learningDiagnostics">
    <section v-if="learningDiagnostics.hasData" class="diagnostic-panel"><header><div><p class="eyebrow">键位表现</p><h2>最需要关注的键</h2></div><span>按错误率排序</span></header><div class="diagnostic-table"><div v-for="item in learningDiagnostics.rows" :key="item.keyCode" class="diagnostic-row"><strong>{{ keyLabelByCode[item.keyCode] || item.keyCode }}</strong><span>{{ item.expectedCount }} 次目标</span><div><i :style="{width:`${Math.min(100, Math.max(5, item.errorRate))}%`}"></i></div><b>{{ item.errorRate }}%</b><small>错 {{ item.wrongCount }} 次</small></div></div></section>
    <section v-else class="learning-empty large"><AlertTriangle :size="24"/><h2>还没有足够的错键数据</h2><p>先完成新手入门、英文或拼音课程，系统会自动建立你的键位画像。</p><button type="button" class="diagnostic-primary" @click="openBeginner">开始新手练习</button></section>
  </template>
</section>

<section v-else-if="page === 'diagnostic-drill'" class="lesson-view learning-view diagnostic-drill-view">
  <div class="lesson-nav"><button @click="openDiagnostics"><ArrowLeft :size="14"/>返回诊断</button><span>错键诊断</span><b>›</b><strong>专项练习</strong></div>
  <section class="diagnostic-drill-panel"><header><div class="drill-header-main"><span class="drill-mode-badge">错键纠正 · 专项训练</span><h1>{{ diagnosticDrill.title }}</h1><p>按顺序完成目标键序列，系统会根据本轮表现继续更新你的诊断结果。</p><div class="drill-key-tags"><span v-for="key in diagnosticKeys()" :key="key">{{ key }}</span></div></div><div class="drill-progress"><div class="drill-progress-ring" :style="{ '--progress': `${diagnosticProgress}%` }"><strong>{{ diagnosticProgress }}%</strong></div><span>完成进度</span></div></header><div class="diagnostic-section-label"><strong>目标序列</strong><span>按顺序输入下方键位</span></div><div class="diagnostic-target"><span v-for="(char,index) in diagnosticTargetCharacters" :key="index" :class="diagnosticCharClass(index,char)">{{ char }}</span></div><div class="diagnostic-section-label input-label"><strong>你的输入</strong><span>错误会即时标红，完成后自动保存本轮表现</span></div><textarea ref="diagnosticInputEl" v-model="diagnosticInput" aria-label="错键专项练习输入" autocomplete="off" autocapitalize="off" spellcheck="false" :disabled="diagnosticDrill.completed" @input="handleDiagnosticInput" placeholder="点击这里，按上方目标键开始练习"></textarea><div class="diagnostic-drill-footer"><span><strong>{{ diagnosticCorrect }}</strong><small>正确</small></span><span><strong>{{ Math.max(0, diagnosticTypedCharacters.length - diagnosticCorrect) }}</strong><small>错误</small></span><span><strong>{{ diagnosticAccuracy }}%</strong><small>准确率</small></span><button v-if="diagnosticDrill.completed" type="button" class="diagnostic-primary" @click="openDiagnosticDrill">再练一次</button></div></section>
</section>

<section v-else-if="page === 'beginner'" class="lesson-view">
  <div class="lesson-nav">
    <button @click="goHome">返回</button><span>首页</span><b>›</b><span>新手入门</span><b>›</b><strong>第{{ beginnerLessonIndex+1 }}关：{{ beginnerLesson.title }}</strong>
    <label class="course-select">选择键位课程：<select :value="beginnerLessonIndex" @change="selectBeginnerLesson($event.target.value)"><option v-for="(lesson,index) in beginnerLessons" :key="lesson.title" :value="index">第{{ index+1 }}关 · {{ lesson.title }}</option></select></label>
  </div>
  <section class="beginner-stage">
    <div class="subtitle-sequence">
      <button v-for="item in beginnerVisibleSequence" :key="item.absoluteIndex" type="button" :class="{done:item.absoluteIndex<beginnerIndex,current:item.absoluteIndex===beginnerIndex}">{{ item.label }}</button>
    </div>
    <div class="beginner-feedback" :class="{ 'is-error': wrongNotice, 'is-complete': beginnerCompleted }" role="status" aria-live="polite"><span v-if="beginnerCompleted">✓ {{ practiceCompleteNotice }}</span><span v-else-if="wrongNotice">✕ {{ wrongNotice }}</span></div>
    <BeginnerKeyboard :rows="typingRows" :target-code="beginnerTarget.code" :pressed-code="pressedCode" :wrong-code="wrongCode" @virtual-key="handleKey"/>
    <StatsBar :seconds="beginnerSeconds" :speed="beginnerSpeed" :progress="Math.round(beginnerIndex/beginnerSequence.length*100)" :accuracy="beginnerAccuracy" @reset="makeBeginnerSequence"/>
    <div class="hands-visual" :aria-label="`${handTargetMeta.label}提示：${beginnerTarget.label}，${handTargetMeta.action}`"><img :src="'/assets/beginner-hands-clean.png'" alt="双手标准键盘手位示意"/><span v-for="(point,index) in handTargetPoints" :key="index" class="hand-target-marker" :style="{ left: `${point.x}px`, top: `${point.y}px` }" aria-hidden="true"></span><div class="hand-target-copy"><strong>{{ handTargetMeta.label }}</strong><span>当前目标 {{ beginnerTarget.label }} · {{ handTargetMeta.action }}</span></div></div>
  </section>
</section>

<section v-else-if="page === 'english-home'" class="lesson-view english-home-view">
  <div class="lesson-nav"><button @click="goHome">返回</button><span>首页</span><b>›</b><strong>英文打字</strong></div>
  <div class="english-welcome"><img :src="'/assets/english-stopwatch.png'" alt="秒表"/><div><h2><em>你好</em>，欢迎您！</h2><p>建议先从 <strong>“单词练习”</strong> 开始，打好基本功，循序渐进，趣味学习！</p></div></div>
  <div class="english-course-list">
    <button type="button" @click="openEnglishLesson('english-word')"><img :src="'/assets/english-word-course.png'" alt="单词练习"/><strong>单词练习</strong></button>
    <button type="button" @click="openEnglishLesson('english-phrase')"><img :src="'/assets/english-phrase-course.png'" alt="语句练习"/><strong>语句练习</strong></button>
    <button type="button" @click="openEnglishLesson('english-article')"><img :src="'/assets/english-article-course.png'" alt="文章练习"/><strong>文章练习</strong></button>
  </div>
</section>

<section v-else-if="page.startsWith('english-')" class="lesson-view english-practice-view" tabindex="0">
  <div class="lesson-nav">
    <button @click="goEnglishHome">返回</button><span>首页</span><b>›</b><span>英文打字</span><b>›</b><strong>第二关：{{ englishLesson.title }}</strong>
    <label class="course-select">课程选择：<select :value="englishLessonIndex[page]" @change="selectEnglishLesson($event.target.value)"><option v-for="(lesson,index) in englishCopy[page]" :key="lesson.selector" :value="index">{{lesson.selector}}</option></select></label>
  </div>
  <label class="time-limit"><input type="checkbox"/>限时 <input type="number" min="1"/> 分钟</label>
  <p v-if="practiceCompleteNotice" class="lesson-complete-notice" role="status">{{practiceCompleteNotice}}</p>
  <div v-if="page !== 'english-article'" class="english-compare" aria-label="目标文字和实际输入对比">
    <div class="english-target-line"><span v-for="(char,index) in englishActiveSegment.line" :key="index" :class="englishCharClass(englishActiveSegment.offset+index,char)">{{ char }}</span></div>
    <div class="english-typed-line" aria-label="实际输入">
      <span v-for="(char,index) in englishArticleTypedLine(englishActiveSegment)" :key="index" :class="englishTypedCharClass(englishActiveSegment.offset+index,char)">{{ char }}</span><span class="english-caret" aria-hidden="true"></span>
    </div>
  </div>
  <p v-if="englishLesson.note" class="english-note">{{ englishLesson.note }}</p>
  <div v-if="page === 'english-article'" class="english-article-lines">
    <div v-for="segment in englishVisibleArticleLines" :key="segment.offset" class="english-article-block">
      <div class="english-article-target-line"><span v-for="(char,index) in segment.line" :key="index" :class="englishCharClass(segment.offset+index,char)">{{ char }}</span></div>
      <div class="english-article-typed-line" aria-label="实际输入">
        <span v-for="(char,index) in englishArticleTypedLine(segment)" :key="index" :class="englishTypedCharClass(segment.offset+index,char)">{{ char }}</span><span v-if="englishArticleCaretVisible(segment)" class="english-caret" aria-hidden="true"></span>
      </div>
    </div>
  </div>
  <BeginnerKeyboard v-if="page !== 'english-article'" :rows="typingRows" :target-code="englishCurrentCode" :pressed-code="pressedCode" @virtual-key="handleKey"/>
  <StatsBar :seconds="practiceSeconds" :speed="englishSpeed" :progress="Math.min(100,englishProgress)" :accuracy="englishAccuracy" @reset="resetEnglishLesson"/>
</section>

<section v-else-if="page === 'pinyin-home'" class="lesson-view pinyin-home-view">
  <div class="lesson-nav"><button @click="goHome">返回</button><span>首页</span><b>›</b><strong>拼音打字</strong></div>
  <div class="pinyin-welcome"><img :src="'/assets/english-stopwatch.png'" alt="秒表"/><div><h2><em>你好</em>，欢迎您！</h2><p>建议先从 <strong>“拼音输入法”</strong> 开始，打好基本功，循序渐进，趣味学习！</p></div></div>
  <div class="pinyin-course-list">
    <button type="button" @click="openPinyinLesson('pinyin-syllable')"><span class="pinyin-course-icon syllable">拼<span>音</span></span><strong>音节练习</strong></button>
    <button type="button" @click="openPinyinLesson('pinyin-word')"><span class="pinyin-course-icon word">词<span>组</span></span><strong>词组练习</strong></button>
    <button type="button" @click="openPinyinLesson('pinyin-article')"><span class="pinyin-course-icon article">文<span>章</span></span><strong>文章练习</strong></button>
  </div>
</section>

<section v-else-if="page.startsWith('pinyin-')" class="lesson-view pinyin-practice-view">
  <div class="lesson-nav">
    <button @click="goHome">返回</button><span>首页</span><b>›</b><span>拼音打字</span><b>›</b><strong>{{ pinyinLesson.level }}：{{ pinyinLesson.title }}</strong>
    <label class="course-select">课程类型：<select :value="page" @change="openPinyinLesson($event.target.value)"><option value="pinyin-syllable">音节练习</option><option value="pinyin-word">词组练习</option><option value="pinyin-article">文章练习</option></select><select class="material-select" :value="pinyinLessonIndex[page]" @change="selectPinyinLesson($event.target.value)"><option v-for="(lesson,index) in pinyinCopy[page]" :key="lesson.selector" :value="index">{{lesson.selector}}</option></select></label>
  </div>
  <label class="time-limit"><input type="checkbox"/>限时 <input type="number" min="1"/> 分钟</label>
  <p v-if="practiceCompleteNotice" class="lesson-complete-notice" role="status">{{practiceCompleteNotice}}</p>
  <div v-if="page === 'pinyin-syllable'" class="pinyin-syllable-board" aria-label="声母和汉字对照">
    <div v-for="item in pinyinVisibleSyllables" :key="item.absoluteIndex" class="pinyin-syllable-item"><span :class="pinyinSyllableClass(item)">{{ item.pinyin }}</span><strong>{{ item.hanzi }}</strong></div>
  </div>
  <PinyinLineInput :key="`${page}-${pinyinLessonIndex[page]}`" ref="pinyinInputEl" v-model="pinyinInput"
    :segments="pinyinInputSegments" :show-targets="page !== 'pinyin-syllable'" :lowercase="page === 'pinyin-syllable'"
    @keydown="handlePinyinKey" @commit="startPinyinPractice" />
  <BeginnerKeyboard v-if="page === 'pinyin-syllable'" :rows="typingRows" :target-code="pinyinCurrentCode" :pressed-code="pressedCode" @virtual-key="handlePinyinVirtualKey"/>
  <StatsBar :seconds="practiceSeconds" :speed="pinyinSpeed" :progress="pinyinProgress" :accuracy="pinyinAccuracy" @reset="resetPinyinLesson(page)"/>
</section>

<section v-else-if="page === 'challenge-home'" class="lesson-view challenge-home-view">
  <div class="lesson-nav"><button @click="goHome">返回</button><span>首页</span><b>›</b><strong>挑战模式</strong></div>
  <div class="challenge-home-layout">
    <div class="challenge-home-main">
      <div class="challenge-welcome"><div class="challenge-number"><strong>60</strong><small>SECONDS</small></div><div class="challenge-welcome-copy"><p class="eyebrow">挑战模式 · 文章竞速</p><h1>一分钟，挑战新纪录</h1><p>选择英文或拼音文章，在 60 秒内持续输入。时间结束后自动结算，并将最佳成绩提交到对应排行榜。</p><div class="challenge-hero-meta"><span><Timer :size="14"/>固定 60 秒</span><span><ArrowUpRight :size="14"/>按正确字数排名</span></div></div></div>
      <div class="challenge-mode-list">
        <button type="button" class="challenge-mode-card english" @click="openChallengeMode('english')"><span class="challenge-mode-icon">EN</span><span class="challenge-mode-copy"><strong>英文挑战</strong><small>输入英文文章，挑战速度与准确率</small></span><span class="challenge-mode-arrow">开始 →</span></button>
        <button type="button" class="challenge-mode-card pinyin" @click="openChallengeMode('pinyin')"><span class="challenge-mode-icon">拼</span><span class="challenge-mode-copy"><strong>中文挑战</strong><small>输入中文文章，争取更高正确字数</small></span><span class="challenge-mode-arrow">开始 →</span></button>
      </div>
    </div>
    <aside class="challenge-rankings" aria-label="挑战排行榜">
      <section v-for="mode in ['english','pinyin']" :key="mode" class="challenge-ranking-card" :class="mode">
        <header><span class="ranking-icon">{{ mode === 'english' ? 'EN' : '中' }}</span><div><strong>{{ mode === 'english' ? '英文排行榜' : '中文排行榜' }}</strong><small>一分钟挑战 · 最佳成绩</small></div><span class="ranking-top-score">{{ challengeLeaderboards[mode].totals.topScore }}<small>字</small></span></header>
        <div v-if="challengeLeaderboardLoading" class="ranking-empty">正在加载排名…</div>
        <ol v-else-if="challengeLeaderboards[mode].rows.length"><li v-for="row in challengeLeaderboards[mode].rows" :key="row.id" :class="{current:row.isCurrentUser}"><b>{{ row.rank }}</b><span>{{ row.nickname }}</span><strong>{{ row.score }} 字</strong><small>{{ Math.round(row.accuracy) }}%</small></li></ol>
        <div v-else class="ranking-empty">暂无成绩<br/><small>完成一次挑战后登上榜单</small></div>
      </section>
    </aside>
  </div>
</section>

<section v-else-if="page.startsWith('challenge-')" class="lesson-view challenge-view">
  <div class="lesson-nav"><button @click="openChallengePage">返回</button><span>首页</span><b>›</b><span>挑战模式</span><b>›</b><strong>{{ activeChallengeLabel }}</strong></div>
  <section v-if="!challenge && !challengeResult" class="challenge-intro">
    <div class="challenge-number">60</div><div><p class="eyebrow">{{ activeChallengeLabel }}</p><h2>一分钟完成一篇{{ activeChallengeMode === 'english' ? '英文' : '中文' }}文章。</h2><p>排行榜按正确字数排序，同分时正确率更高者在前。成绩只绑定当前学生账号。</p><button type="button" @click="startChallenge(activeChallengeMode)">{{ user ? (challengeSubmitting ? '准备中…' : '开始挑战') : '登录后开始' }}</button></div>
  </section>
  <section v-else-if="challenge" class="challenge-running">
    <div class="challenge-practice-toolbar"><span>课程选择：<strong>{{ activeChallengeLabel }}</strong><small class="challenge-page-indicator">第 {{ challengeArticlePage.current }} / {{ challengeArticlePage.total }} 段</small></span><span class="challenge-clock">剩余 <b>{{ challengeRemaining }}</b> 秒</span></div>
    <div ref="challengeAnchorEl" class="challenge-capture-anchor">
    <div class="challenge-article-lines" :class="activeChallengeMode" aria-label="挑战文章">
      <div v-for="segment in challengeVisibleArticleLines" :key="segment.offset" class="challenge-article-block">
        <div class="challenge-target-line"><span v-for="(char,index) in segment.line" :key="index" :class="{correct:segment.offset+index<challengeTypedCharacters.length&&challengeTypedCharacters[segment.offset+index]===char,wrong:segment.offset+index<challengeTypedCharacters.length&&challengeTypedCharacters[segment.offset+index]!==char,current:segment.offset+index===challengeTypedCharacters.length}">{{ char }}</span></div>
        <div class="challenge-typed-line" aria-label="实际输入" @mousedown.prevent="focusChallengeInput"><span v-for="(char,index) in challengeTypedLine(segment)" :key="index" :class="{correct:char===challengeTargetCharacters[segment.offset+index],wrong:char!==challengeTargetCharacters[segment.offset+index]}">{{ char }}</span><span v-if="challengeCaretVisible(segment)" class="english-caret" aria-hidden="true"></span></div>
      </div>
    </div>
    <textarea ref="challengeInputEl" v-model="challengeInput" class="challenge-input-capture" aria-label="挑战实际输入" autofocus :disabled="challengeRemaining<=0 || countingDown" :placeholder="activeChallengeMode === 'english' ? '输入英文文章' : '输入中文文章'" @input="persistChallenge" @paste.prevent/>
    </div>
    <StatsBar :seconds="Math.max(0, 60 - challengeRemaining)" :speed="challengeSpeed" :progress="Math.min(100, Math.round(challengeTypedCharacters.length / Math.max(1, challengeTargetCharacters.length) * 100))" :accuracy="challengeAccuracy"/>
    <div v-if="countingDown" class="challenge-countdown" role="status" aria-live="assertive">
      <strong>{{ challengeCountdown }}</strong>
      <small>准备开始</small>
    </div>
  </section>
  <section v-else class="challenge-result"><Trophy :size="46"/><h2>{{ challengeResult.error ? '提交失败' : '挑战完成' }}</h2><p v-if="challengeResult.error">{{ challengeResult.error }}</p><template v-else><strong>{{ challengeResult.score }}</strong><span>正确字数 · 正确率 {{ Math.round(challengeResult.accuracy) }}%</span><p>个人最好 {{ challengeResult.personalBest }} 字 · 排名 {{ challengeResult.rank || '-' }}</p></template><button type="button" @click="startChallenge(activeChallengeMode)">再来一次</button></section>
</section>

<section v-else class="lesson-view"><div class="lesson-nav"><button @click="goHome">返回</button><span>首页</span><b>›</b><strong>{{ category }}</strong></div><section class="lesson-panel practice-panel"><div class="lesson-title"><div><p class="eyebrow">自由练习 · {{ category }}</p><h2>{{ passage?.title || '正在准备练习文章' }}</h2><p>在输入框中输入上方文字，系统会实时计算准确率。</p></div><select v-model="category" @change="loadPassage"><option>拼音打字</option><option>校园生活</option><option>成长励志</option></select></div><div class="practice-metrics"><span>正确 <b>{{ score.correct }}</b> 字</span><span>正确率 <b>{{ score.accuracy }}%</b></span><span>最后按键 <b>{{ lastCode }}</b></span></div><div class="text-sheet"><span v-for="(char,i) in targetChars" :key="i" :class="{correct:i<score.input.length&&score.input[i]===char,wrong:i<score.input.length&&score.input[i]!==char,current:i===score.input.length}">{{ char }}</span></div><textarea :value="typed" @input="updateInput" placeholder="在这里输入上方文字"></textarea><Keyboard :keyboard="keyboard" :key-class="keyClass" @virtual-key="handleKey"/></section></section>
</main>
<div v-if="authOpen" class="modal-backdrop" @mousedown.self="authOpen=false">
  <section class="auth-modal" :class="{ 'profile-modal': authView === 'profile' && user }" role="dialog" aria-modal="true" :aria-label="authView === 'profile' ? '个人中心' : '学生账号'">
    <button class="modal-close" type="button" title="关闭" @click="authOpen=false">×</button>
    <template v-if="authView === 'profile' && user">
      <header class="profile-modal-header"><div><p class="eyebrow">个人中心</p><h2>我的学习档案</h2><p>管理个人资料，查看学习进展和练习入口。</p></div><ShieldCheck :size="24"/></header>
      <div class="profile-modal-body">
        <aside class="profile-identity">
          <div class="auth-avatar"><img v-if="user.avatarUrl" :src="user.avatarUrl" :alt="`${user.displayName}的头像`"/><span v-else>{{ user.displayName.slice(0,1) }}</span></div>
          <h3>{{ user.displayName }}</h3><p class="auth-user">@{{ user.username }}</p><span class="profile-status"><i></i>账号已启用</span>
          <label class="avatar-upload-button"><input ref="avatarFileEl" type="file" accept="image/png,image/jpeg,image/webp" :disabled="avatarBusy" @change="uploadAvatar"/><span>{{ avatarBusy ? '处理中…' : '更换头像' }}</span></label>
          <p v-if="avatarMessage" class="avatar-message" :class="{success: avatarMessage.includes('已更新')}">{{ avatarMessage }}</p>
          <div class="profile-account-meta"><span>登录身份</span><strong>学生账号</strong><span>排行榜</span><strong>成绩绑定当前账号</strong></div>
        </aside>
        <main class="profile-main">
          <section class="profile-stage"><div><p class="eyebrow">当前阶段</p><strong>{{ learningSummary?.level?.label || '准备开始' }}</strong><span>{{ learningSummary?.level?.next || '完成一次练习后，系统会建立你的成长记录。' }}</span></div><div class="profile-streak"><Flame :size="17"/><strong>{{ learningSummary?.stats?.streak || 0 }}</strong><span>连续天数</span></div></section>
          <section class="profile-metrics"><article><span>累计练习</span><strong>{{ learningSummary?.stats?.sessions || 0 }}</strong><small>次</small></article><article><span>平均速度</span><strong>{{ learningSummary?.stats?.averageSpeed || 0 }}</strong><small>字 / 分</small></article><article><span>平均准确率</span><strong>{{ learningSummary?.stats?.averageAccuracy || 0 }}%</strong><small>训练表现</small></article><article><span>待完成任务</span><strong>{{ pendingAssignmentCount }}</strong><small>项</small></article></section>
          <section class="profile-actions"><button type="button" @click="openGrowth"><span class="profile-action-icon green"><BarChart3 :size="18"/></span><span><strong>我的成长</strong><small>查看趋势、训练时长和最近记录</small></span><ChevronRight :size="16"/></button><button type="button" @click="openDiagnostics"><span class="profile-action-icon orange"><Target :size="18"/></span><span><strong>错键诊断</strong><small>查看薄弱键位并开始专项练习</small></span><ChevronRight :size="16"/></button></section>
          <footer class="profile-modal-footer"><span>头像会同步显示在红蓝打字占领战中。</span><button type="button" class="profile-logout" :disabled="authBusy" @click="logout"><LogOut :size="15"/>退出登录</button></footer>
        </main>
      </div>
    </template>
    <template v-else>
      <h2>学生账号</h2><p class="auth-intro">使用姓名和密码登录，登录后保存竞速成绩并进入班级排行榜。</p>
      <div class="auth-tabs"><button type="button" :class="{active:authView==='login'}" @click="authView='login';authMessage=''">登录</button><button type="button" :class="{active:authView==='register'}" @click="authView='register';authMessage=''">注册</button></div>
      <form v-if="authView === 'login'" @submit.prevent="submitLogin"><label>姓名或用户名<input v-model.trim="loginForm.username" autocomplete="username" required maxlength="32"/></label><label>密码<input v-model="loginForm.password" type="password" autocomplete="current-password" required/></label><button class="auth-primary" :disabled="authBusy">{{ authBusy ? '登录中…' : '登录' }}</button></form>
      <form v-else @submit.prevent="submitRegister"><label>姓名<input v-model.trim="registerForm.displayName" autocomplete="name" required maxlength="12"/></label><label>密码<input v-model="registerForm.password" type="password" minlength="6" maxlength="12" pattern="(?:[0-9]{6,12}|(?=.*[A-Za-z])(?=.*[0-9])[A-Za-z0-9]{6,12})" autocomplete="new-password" required placeholder="6-12 位纯数字，或字母数字组合"/></label><button class="auth-primary" :disabled="authBusy">{{ authBusy ? '提交中…' : '提交注册申请' }}</button></form>
      <p class="auth-message" :class="{success:authMessage.includes('成功') || authMessage.includes('提交')}">{{ authMessage }}</p>
    </template>
  </section>
</div>
<div v-if="leaderboardOpen" class="modal-backdrop" @mousedown.self="leaderboardOpen=false"><section class="leaderboard-modal" role="dialog" aria-modal="true" aria-label="一分钟竞速排行榜"><button class="modal-close" type="button" title="关闭" @click="leaderboardOpen=false">×</button><Trophy :size="34"/><h2>一分钟竞速排行榜</h2><div class="leaderboard-summary"><span>最高字数 <b>{{ leaderboardTotals.topScore }}</b></span><span>参与人数 <b>{{ leaderboardTotals.participants }}</b></span></div><ol><li v-for="row in leaderboardRows" :key="row.id" :class="{current:row.isCurrentUser}"><b>{{ row.rank }}</b><span>{{ row.nickname }}</span><strong>{{ row.score }} 字</strong><small>{{ Math.round(row.accuracy) }}%</small></li></ol><p v-if="!leaderboardRows.length" class="leaderboard-empty">还没有人上榜，第一名等你来拿。</p></section></div>
</div>
</template>
