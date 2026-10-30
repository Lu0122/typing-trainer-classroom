// 「AI 生成文章」的语言规则。
//
// 前台是按分类取文章的：练习页按分类查 passages，竞速模式固定取「一分钟挑战 / 英文挑战 / 拼音挑战」，
// 比赛指定文章也从 passages 里挑。所以「分类」就等于「这篇文章是什么语言、怎么打」，
// 不能让模型自己决定 —— 选了「英文打字」就必须出英文，选了「拼音打字」就必须出拼音音节。
//
// 这个文件是唯一来源：分类 → 语言、提示词、生成后校验，都从这里出。

// 只有这三个分类不是中文。其余（含「拼音挑战」）都是中文正文：
// 「拼音挑战」的学生是用拼音输入法打中文，库里存的也是中文。
const LANGUAGE_BY_CATEGORY = {
  英文打字: 'en',
  英文挑战: 'en',
  拼音打字: 'pinyin'
};

const LANGUAGE_LABEL = { zh: '中文', en: '英文', pinyin: '拼音' };

// 前台没有任何可达路径会用到这两个分类的文章（拼音课程走前端内置题库，
// 比赛候选池又过滤掉 language==='pinyin'）。后台下拉不再提供它们，
// 这里再拦一道：下拉里选不到的分类，也不该还能生成。
const DISABLED_CATEGORIES = new Set(['英文打字', '拼音打字']);

const HANZI = /[\u4e00-\u9fff]/;
// 全角标点 / 全角字母：英文文章里出现就说明模型串味了。
const FULLWIDTH = /[\u3000-\u303f\uff01-\uff5e]/;

function articleLanguageForCategory(category) {
  return LANGUAGE_BY_CATEGORY[String(category ?? '').trim()] || 'zh';
}

function isArticleGenerationSupported(category) {
  return !DISABLED_CATEGORIES.has(String(category ?? '').trim());
}

// 前端传的是「字符数」。英文按词、拼音按音节换算，模型才听得懂规模。
function lengthInstruction(length, language) {
  const total = Math.min(2000, Math.max(80, Number.parseInt(length, 10) || 400));
  if (language === 'en') return `约 ${Math.max(60, Math.round(total / 6))} 个英文单词（${total} 个字符左右）`;
  if (language === 'pinyin') return `约 ${Math.max(40, Math.round(total * 0.75))} 个拼音音节`;
  return `约 ${total} 字`;
}

const SYSTEM_PROMPTS = {
  zh: '你是中文打字练习文章编辑。请生成适合学生练习的自然中文短文，内容积极、句子完整、标点规范，避免敏感和虚构事实。必须严格按 JSON Schema 返回，不要输出额外文字。',
  en: '你是英文打字练习文章编辑，为中文母语的学生写英文打字练习短文。用词简单、句子完整、语法正确，语气积极，避免敏感内容。必须严格按 JSON Schema 返回，不要输出额外文字。',
  pinyin: '你是拼音打字练习文章编辑。你只输出汉语拼音音节串：不带汉字、不带声调、全小写字母。必须严格按 JSON Schema 返回，不要输出额外文字。'
};

// 每条都是硬要求：前台判定是逐字比对，多一个空格、多一个汉字都会被算成打错。
const CONTENT_RULES = {
  zh: [
    '正文全部使用中文和全角标点（，。、；：？！“”）。',
    '不要在正文里重复标题。',
    '不要输出拼音或乱码。'
  ],
  en: [
    '正文全部使用英文，单词之间只用一个半角空格。',
    '标点只用英文半角标点（, . ; : ? ! 引号 括号）。',
    '不要出现任何汉字、全角标点或拼音。',
    '不要在正文里重复标题。',
    '需要分段时用换行。'
  ],
  pinyin: [
    '正文是汉语拼音音节串，音节之间只用一个半角空格。',
    '一个音节就是一个汉字的拼音，例如 ni hao tong xue。',
    '不要写汉字，不要加声调符号，全部小写字母。',
    '句子之间用全角标点（，。！？）分隔，句末不加空格。'
  ]
};

const TITLE_RULES = {
  zh: '标题用中文。',
  en: '标题也用英文。',
  pinyin: '标题用中文，不要用拼音。'
};

function buildArticleMessages({ title, category, length, language, feedback } = {}) {
  const lang = language || articleLanguageForCategory(category);
  const lines = [
    `请生成一篇${LANGUAGE_LABEL[lang]}打字练习文章，长度${lengthInstruction(length, lang)}。`,
    `分类：${String(category ?? '').trim() || '未指定'}。标题提示：${String(title ?? '').trim() || '请自动拟定一个简洁标题'}。`,
    ...CONTENT_RULES[lang].map((rule) => `- ${rule}`),
    `- ${TITLE_RULES[lang]}`
  ];
  if (feedback) lines.push(`上一次生成不合格：${feedback}。请严格按上面的要求重新生成。`);
  return [
    { role: 'system', content: SYSTEM_PROMPTS[lang] },
    { role: 'user', content: lines.join('\n') }
  ];
}

// 模型排版习惯不可控（中文里爱加空格、英文里爱连打空格），先清洗再校验，
// 否则会因为「多一个空格」把本来能用的文章判死。
// 中文的空格必须删掉：前台判定是逐字比对，多一个空格就会被算成打错。
// 换行保留，用来分段。
function normalizeArticleContent(content, language) {
  const lang = language || 'zh';
  const lines = String(content ?? '').replace(/\r\n?/g, '\n').split('\n');
  const cleaned = lines.map((line) => {
    if (lang === 'en') return line.replace(/[ \t\u3000]+/g, ' ').trim();
    if (lang === 'pinyin') return line.replace(/[ \t\u3000]+/g, ' ').replace(/\s+([，。！？、；：])/g, '$1').trim();
    return line.replace(/[ \t\u3000]+/g, '').trim();
  });
  return cleaned.filter(Boolean).join('\n');
}

// 返回 null 表示合格，返回字符串表示不合格的原因（会回喂给模型重生成一次）。
function validateArticleContent(content, language) {
  const lang = language || 'zh';
  const text = String(content ?? '').replace(/\r\n?/g, '\n').trim();
  if (text.length < 20) return '正文太短';

  if (lang === 'en') {
    if (HANZI.test(text)) return '英文文章里出现了汉字';
    if (!/[A-Za-z]{3}/.test(text)) return '正文里没有英文单词';
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    if (letters / text.length < 0.6) return '英文文章的字母占比过低，可能混入了中文或符号';
    if (FULLWIDTH.test(text)) return '英文文章里出现了全角标点';
    return null;
  }

  if (lang === 'pinyin') {
    if (HANZI.test(text)) return '拼音文章里出现了汉字';
    const stripped = text.replace(/[，。！？、；：]/g, ' ');
    const illegal = [...new Set(stripped.match(/[^a-z\s]/g) || [])];
    if (illegal.length) return `拼音文章里出现了不允许的字符：${illegal.slice(0, 5).join(' ')}`;
    const syllables = stripped.split(/\s+/).filter(Boolean);
    if (syllables.length < 10) return '拼音音节太少';
    const tooLong = syllables.find((syllable) => syllable.length > 6);
    if (tooLong) return `拼音音节过长：${tooLong}`;
    return null;
  }

  // 中文：空格在 normalizeArticleContent 里已经删掉，这里只确认它确实是中文。
  if (!HANZI.test(text)) return '中文文章里没有汉字';
  return null;
}

module.exports = {
  LANGUAGE_BY_CATEGORY,
  DISABLED_CATEGORIES,
  articleLanguageForCategory,
  isArticleGenerationSupported,
  buildArticleMessages,
  normalizeArticleContent,
  validateArticleContent,
  lengthInstruction
};
