const test = require('node:test');
const assert = require('node:assert/strict');
const {
  articleLanguageForCategory,
  isArticleGenerationSupported,
  buildArticleMessages,
  normalizeArticleContent,
  validateArticleContent,
  lengthInstruction
} = require('../backend/article-prompt');

test('分类决定生成语言：只有英文/拼音分类不是中文', () => {
  assert.equal(articleLanguageForCategory('英文打字'), 'en');
  assert.equal(articleLanguageForCategory('英文挑战'), 'en');
  assert.equal(articleLanguageForCategory('拼音打字'), 'pinyin');
  // 「拼音挑战」的学生是用拼音输入法打中文，库里存的也是中文。
  assert.equal(articleLanguageForCategory('拼音挑战'), 'zh');
  assert.equal(articleLanguageForCategory('一分钟挑战'), 'zh');
  assert.equal(articleLanguageForCategory('校园生活'), 'zh');
  assert.equal(articleLanguageForCategory('未知分类'), 'zh');
  assert.equal(articleLanguageForCategory(''), 'zh');
  assert.equal(articleLanguageForCategory(null), 'zh');
});

test('提示词按语言给出硬性要求，并带上分类和标题', () => {
  const zh = buildArticleMessages({ title: '清晨的校园', category: '校园生活', length: 400 });
  assert.match(zh[0].content, /中文打字练习文章/);
  assert.match(zh[1].content, /校园生活/);
  assert.match(zh[1].content, /清晨的校园/);
  assert.match(zh[1].content, /不要在正文里重复标题/);
  assert.match(zh[1].content, /标题用中文/);

  const en = buildArticleMessages({ title: 'Keep Going', category: '英文挑战', length: 400 });
  assert.match(en[0].content, /英文打字练习文章/);
  assert.match(en[1].content, /英文单词/);
  assert.match(en[1].content, /不要出现任何汉字/);
  assert.match(en[1].content, /标题也用英文/);

  const pinyin = buildArticleMessages({ title: '拼音练习', category: '拼音打字', length: 400 });
  assert.match(pinyin[0].content, /拼音音节串/);
  assert.match(pinyin[1].content, /不要加声调符号/);
  assert.match(pinyin[1].content, /标题用中文/);
});

test('重试时把上一次的不合格原因回喂给模型', () => {
  const messages = buildArticleMessages({ title: 'T', category: '英文挑战', length: 400, feedback: '英文文章里出现了汉字' });
  assert.match(messages[1].content, /上一次生成不合格：英文文章里出现了汉字/);
  const clean = buildArticleMessages({ title: 'T', category: '英文挑战', length: 400 });
  assert.doesNotMatch(clean[1].content, /上一次生成不合格/);
});

test('长度按语言换算：中文按字、英文按词、拼音按音节', () => {
  assert.match(lengthInstruction(400, 'zh'), /约 400 字/);
  assert.match(lengthInstruction(400, 'en'), /英文单词/);
  assert.match(lengthInstruction(400, 'pinyin'), /拼音音节/);
  // 越界值兜底
  assert.match(lengthInstruction(0, 'zh'), /约 400 字/);
  assert.match(lengthInstruction(99999, 'zh'), /约 2000 字/);
});

test('中文正文：清洗掉空格，换行保留用来分段，必须含汉字', () => {
  // 中文里多打的空格前台不会当成要打的字（targetChars 会过滤空白），所以清洗而不是报错。
  assert.equal(normalizeArticleContent('清晨走进 教室，我们打开电脑。\n\n\n遇到\u3000问题先听清要求。', 'zh'), '清晨走进教室，我们打开电脑。\n遇到问题先听清要求。');
  assert.equal(validateArticleContent(normalizeArticleContent('清晨走进 教室，我们打开电脑，检查设备是否正常。', 'zh'), 'zh'), null);
  assert.equal(validateArticleContent('清晨走进教室，我们打开电脑，检查设备是否正常。\n遇到问题先听清要求，再一步一步完成。', 'zh'), null);
  assert.match(validateArticleContent('Every small step matters when typing on the keyboard.', 'zh'), /没有汉字/);
  assert.match(validateArticleContent('太短了', 'zh'), /太短/);
});

test('英文正文：清洗多余空格，不允许汉字和全角标点', () => {
  assert.equal(normalizeArticleContent('Keep Learning   Keep learning every day.  ', 'en'), 'Keep Learning Keep learning every day.');
  assert.equal(normalizeArticleContent('First line.\n\n\nSecond  line. ', 'en'), 'First line.\nSecond line.');
  assert.equal(validateArticleContent('Every small step matters when you are learning to type.', 'en'), null);
  assert.match(validateArticleContent('Every small step matters 每一步。', 'en'), /汉字/);
  assert.match(validateArticleContent('Every small step matters，then keep going.', 'en'), /全角标点/);
  assert.match(validateArticleContent('123 456 789 000 111 222 333', 'en'), /没有英文单词/);
});

test('拼音正文：不允许汉字、大写和声调，音节不能过长', () => {
  const sample = 'ni hao tong xue，huan ying lai dao da zi lian xi。qing fang song shuang shou';
  assert.equal(validateArticleContent(sample, 'pinyin'), null);
  assert.match(validateArticleContent('ni hao tong xue，欢迎来到', 'pinyin'), /汉字/);
  assert.match(validateArticleContent('ni Hao tong xue，qing fang song', 'pinyin'), /不允许的字符/);
  assert.match(validateArticleContent('nǐ hao tong xue，qing fang song', 'pinyin'), /不允许的字符/);
  assert.match(validateArticleContent('nihao tongxue qing fangsong shuangshou zai lai yi ci ba', 'pinyin'), /音节过长/);
  assert.match(validateArticleContent('ni hao', 'pinyin'), /太短/);
});

test('下拉里选不到的分类也不允许 AI 生成', () => {
  assert.equal(isArticleGenerationSupported('校园生活'), true);
  assert.equal(isArticleGenerationSupported('一分钟挑战'), true);
  assert.equal(isArticleGenerationSupported('英文挑战'), true);
  assert.equal(isArticleGenerationSupported('拼音挑战'), true);
  // 前台没有任何可达路径用到这两类文章
  assert.equal(isArticleGenerationSupported('英文打字'), false);
  assert.equal(isArticleGenerationSupported('拼音打字'), false);
});
