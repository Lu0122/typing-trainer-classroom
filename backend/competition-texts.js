// 比赛题库：按难度分三档，每档多篇，同一轮内所有人用同一篇。
//
// 为什么单独建题库，不复用 boss.js 的 LESSONS
// - LESSONS 是「打 Boss」用的短句（27~32 字），90 秒的比赛里高手要换 3~4 段，
//   换段按回车，比赛就会变成「回车速度赛」。
// - 比赛题要够长：中等选手 90 秒大约能打 120~150 字，单篇 70~90 字刚好换 1~2 段。
//
// 硬性约定：**题面里不能出现空格**。
// - 判定是逐字比对原始字符串（含标点），题面里有空格就必须真的敲空格；
//   而中文输入法用空格上屏，很容易多出一个空格，导致「明明打对了却算错」。
// - 需要留白的地方用中文标点断开，不要用空格对齐。

const BANKS = {
  // 入门：常用字 + 简单标点，适合刚学打字或低年级。
  basic: [
    '今天早上我七点起床，洗了脸就下楼吃早饭。妈妈已经把粥盛好，还煎了两个鸡蛋。吃完饭我背起书包出门，路上遇到了同班的小林，我们一边走一边聊天，很快就到了学校。',
    '体育课上我们练习跳绳。老师先让大家活动手腕和脚踝，然后分成四组比赛。我一开始总是被绳子绊住，跳不了几下就停下来。后来我放慢速度，找准节奏，一口气跳了六十多个，同学们都为我鼓掌。',
    '周末我和爸爸去河边钓鱼。水面很平静，远处的山倒映在水里。我们坐在岸边的石头上，谁也没有说话。等了很久，浮标忽然动了一下，我赶紧提起鱼竿，果然钓到了一条小鱼。',
    '教室里安静得只听见笔尖写字的声音。窗外的树被风吹得沙沙作响，阳光斜斜地照在课桌上。我做完最后一道题，抬头看了一眼墙上的钟，还有十分钟才下课，于是又把答案检查了一遍。',
    '奶奶家的院子里种着一棵桂花树。每到秋天，满树都是细小的黄花，风一吹，香味就飘进屋里。我和表弟喜欢在树下捡落花，装进小布袋里，放在书包上，走到哪里都带着一股甜味。',
    '放学的时候下起了小雨。我没有带伞，只好站在校门口的屋檐下等。同桌看见了我，把伞递过来一半，说一起走吧。我们挤在一把伞下慢慢走回家，半边肩膀都被淋湿了，心里却很暖和。',
    '做菜其实并不难。先把菜洗干净切成小段，锅里放一点油，等油热了再下锅。炒的时候要不停地翻动，最后加盐调味。第一次做可能不好吃，多做几次就熟练了，说不定还能自己琢磨出新做法。',
    '图书馆的角落里有一张旧木桌，我常常坐在那里看书。管理员阿姨认得我，每次都笑着点点头。她说读书是一件慢事情，不用着急，一天看一点，一年下来就是很多本。'
  ],

  // 标准：书面语、成语、较长句，比赛默认档。
  standard: [
    '清晨的校园笼罩着一层薄雾，操场上只有几个晨跑的身影。教学楼的窗户一扇接一扇亮起来，像是有人悄悄点亮的灯。我站在走廊尽头，深吸一口气，把昨天没弄懂的题目在心里又默念了一遍。',
    '真正让人成长的，往往不是一次漂亮的成功，而是那些反复出错、又反复改正的过程。就像练字一样，写坏一张纸不要紧，重要的是下一次落笔时，手腕比之前稳了一点点。',
    '山间的溪水从石缝里流出来，绕过青苔，汇成一条细细的水流。它不急着奔向远方，只是在每一块石头前轻轻转个弯，然后继续向前。有人说这就是时间的样子，看似缓慢，却从不回头。',
    '母亲总在冬天织毛衣。灯光下，她的手指在毛线之间来回穿梭，针脚细密而均匀。我问她为什么不买一件，她说买的虽然好看，却不合身。后来我才明白，她织进去的不只是毛线，还有整个冬天的耐心。',
    '读一本旧书，像是和一个隔了很久的人说话。纸页发黄，边角卷起，有人在空白处写了批注，字迹已经模糊。你会忍不住猜想他当时的心情，然后忽然发现，原来很多困惑并不是只有你一个人有。',
    '雨停之后，屋檐还在滴水。一只麻雀落在电线上，抖了抖翅膀，水珠四散开来。街道被冲洗得干干净净，空气里有泥土的味道。行人陆续走出屋檐，脚步比刚才轻快了许多。',
    '做事最怕的是三心二意。手上做着一件事，心里想着另一件事，结果两件都做不好。不如把要做的事情排个顺序，一次只专心做一件，做完再放下。看起来慢，实际上省下了许多重新开始的时间。',
    '黄昏的时候，菜市场渐渐安静下来。摊主们收拾着剩下的菜，把纸箱压平，把地面扫干净。有人推着三轮车慢慢走远，车上的灯泡晃出一圈暖黄的光。这座城市的一天，就这样温柔地收尾了。'
  ],

  // 挑战：混入数字、英文、符号，决赛用，靠数字与符号拉开差距。
  challenge: [
    '2026年10月，学校举办第3届打字比赛。报名时间：10月20日至10月24日；比赛地点：实训楼302机房。参赛同学需提前15分钟到场，签到后按座位号入座，不得携带任何纸质资料。',
    '一台电脑的正常输入速度大约是40至60字每分钟，熟练者可以达到90字每分钟以上。提升速度的关键有三点：第一，正确的指法；第二，稳定的节奏；第三，每天的重复练习。不要一开始就追求快，准确率低于95%时，速度再高也没有意义。',
    '实验步骤：第一步，打开软件，点击新建项目；第二步，在设置中把编码改为UTF-8；第三步，保存文件，命名为test_01.txt；第四步，运行程序，观察控制台输出的结果是否符合预期。若出现错误码404，请检查路径是否正确。',
    '英语学习并不神秘。每天听20分钟、读2页短文、写5个句子，坚持90天，效果会远远超过考前突击。记住：输入和输出要平衡，只看不写，永远学不会用。',
    '数据显示，2025年全国快递业务量超过1500亿件，同比增长约18%。其中，农村地区的包裹量增速最快，达到25%以上。这意味着，越来越多的商品正通过物流网络，从城市流向乡村，也把乡村的特产带回城市。',
    '会议纪要：第一，确认比赛时间为14点至16点30分；第二，由张老师负责题库审核，李老师负责机房调试；第三，各班主任于本周五前提交参赛名单，格式为姓名加学号加班级；第四，未尽事宜另行通知。',
    '快捷键是效率的捷径：Ctrl+C复制，Ctrl+V粘贴，Ctrl+Z撤销，Ctrl+S保存，Ctrl+F查找。养成随手保存的习惯，可以避免90%以上的数据丢失事故。记住，后悔药并不存在，但撤销键有时候算半颗。',
    '判断一段代码写得好不好，可以看三个指标：第一是可读性，别人能不能看懂；第二是可维护性，改一个地方会不会牵连一片；第三是健壮性，遇到异常输入会不会崩。三者之中，可读性最重要，因为代码是写给人类看的。'
  ]
};

const LEVELS = Object.freeze(['basic', 'standard', 'challenge']);
const LEVEL_LABELS = Object.freeze({ basic: '入门', standard: '标准', challenge: '挑战' });

const ENGLISH_COMPETITION_TEXTS = [
  'A good typing habit begins with accuracy and a steady rhythm. Keep your eyes on the sentence, let your fingers find the keys, and correct your mistakes before they grow. Practice does not need to be perfect every day. Small efforts repeated over time can make a remarkable difference.',
  'Our classroom is a place to learn together. Some students move quickly, while others need more time to find their pace. Each careful attempt teaches us something useful. When we share ideas, listen to one another, and keep trying, everyone has a chance to improve.',
  'Technology helps us work, study, and communicate across great distances. A keyboard may seem ordinary, but it connects our thoughts to the wider world. Clear writing, patient reading, and accurate typing are practical skills that we can use in many different jobs.'
];

function speedTextAt(language, index) {
  const source = language === 'en' ? ENGLISH_COMPETITION_TEXTS : BANKS.standard;
  const count = language === 'en' ? 4 : 5;
  return Array.from({ length: count }, (_, offset) => source[(index + offset) % source.length]).join(language === 'en' ? ' ' : '');
}

function textsFor(level) {
  return BANKS[level] || BANKS.standard;
}

// 按序号取篇目，超出长度就循环，保证任何 sequence 都能拿到题。
function textAt(level, index) {
  const bank = textsFor(level);
  const size = bank.length;
  return bank[((index % size) + size) % size];
}

// ------------------------------------------------------------ 老师指定文章（来自「练习文章」）
//
// 候选项来自后台「练习文章」表（passages），不是代码里写死的题库：
// 老师只维护一份文章，练习和比赛共用。赛事配置里存 passage id，
// 老师事后改了文章内容，已建赛事自动用新版。

// 速度赛的题面长度目标（中文字符数）。按 100 字/分钟的高手算，2 分钟能打 200 字，
// 400 字保证时限内没人打完，比赛仍是「限时比正确字数」而不是「比谁先打完」。
const SPEED_TARGET_CHARS = 400;
// 英文按字符数算，同样时长下约为中文的 2 倍。
const SPEED_ENGLISH_FACTOR = 2;
// 拼接上限，防止目标长度被配置成天文数字时把题面拼到几万字。
const SPEED_MAX_PARTS = 8;

// 语言判定：
// - 含汉字 → 中文；
// - 不含汉字但用了全角标点 → 拼音（如「ni hao tong xue，huan ying…」），拼音输入不是打文章，比赛里不列；
// - 其余含拉丁字母 → 英文。
function passageLanguage(passage) {
  const text = String(passage?.content || '');
  if (!text) return 'zh';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[，。！？；：、“”‘’（）]/.test(text)) return 'pinyin';
  return /[A-Za-z]/.test(text) ? 'en' : 'zh';
}

// 题面清洗：中文必须没有空格（输入法空格上屏会多打一个空格被判错），
// 英文保留词间单个空格。
function typingText(text, language) {
  const value = String(text || '').replace(/\r\n?/g, '\n');
  return language === 'en' ? value.replace(/\s+/g, ' ').trim() : value.replace(/\s+/g, '');
}

function toPassage(row) {
  const language = passageLanguage(row);
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    language,
    content: typingText(row.content, language)
  };
}

// 后台「指定文章」列表：按分类分组用，只给标题、字数和预览，不下发全文。
// 拼音文章（内容是拼音音节）不进候选：比赛打的是文章，不是拼音练习。
function passageCatalog(db) {
  return db.prepare(`SELECT id, title, category, content FROM passages
    WHERE is_active = 1 ORDER BY category, id`).all()
    .map((row) => toPassage(row))
    .filter((passage) => passage.language !== 'pinyin')
    .map((passage) => ({
      id: passage.id,
      title: passage.title,
      category: passage.category,
      language: passage.language,
      length: passage.content.length,
      preview: passage.content.slice(0, 30)
    }));
}

// 按 id 取文章。includeInactive 用于「已建赛事继续用」：
// 老师停用某篇只是为了它不再出现在新建赛事的候选里，不该把已经排好的比赛弄坏。
function passagesByIds(db, ids, { includeInactive = false } = {}) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!list.length) return [];
  const activeOnly = includeInactive ? '' : ' AND is_active = 1';
  const rows = db.prepare(`SELECT id, title, category, content FROM passages
    WHERE id IN (${list.map(() => '?').join(',')})${activeOnly}`).all(...list);
  // 保持老师勾选的顺序
  const byId = new Map(rows.map((row) => [row.id, toPassage(row)]));
  return list.map((id) => byId.get(id)).filter(Boolean);
}

// 以指定文章开头补足题面：同分类的其它文章优先往后接，不够再用其它同语言文章。
// 分类里只有一篇时也能接上，不会因为凑不够长度把比赛变短。
function speedTextFromPassage(db, passage, { minLength = SPEED_TARGET_CHARS, maxParts = SPEED_MAX_PARTS } = {}) {
  const english = passage.language === 'en';
  const separator = english ? ' ' : '';
  const target = english ? minLength * SPEED_ENGLISH_FACTOR : minLength;
  const parts = [passage.content];
  let length = passage.content.length;
  const others = db.prepare(`SELECT id, title, category, content FROM passages
    WHERE is_active = 1 AND id <> ? ORDER BY id`).all(passage.id).map(toPassage)
    .filter((item) => item.language === passage.language && item.content);
  const ordered = [
    ...others.filter((item) => item.category === passage.category),
    ...others.filter((item) => item.category !== passage.category)
  ];
  for (let index = 0; index < ordered.length && length < target && parts.length < maxParts; index += 1) {
    parts.push(ordered[index].content);
    length += ordered[index].content.length + separator.length;
  }
  return parts.join(separator);
}

// 团队阵营赛的题面是「一段一段」打的（每打完一段攻占 1% 领地），所以指定文章要切成段。
// 按中文句末标点断句，再把短句合并到不超过 max 字；单句超长时硬切，避免出现一整段两百字。
const SEGMENT_MAX_CHARS = 48;

function segmentText(text, { max = SEGMENT_MAX_CHARS } = {}) {
  const sentences = String(text || '').split(/(?<=[。！？；：!?;])/).filter(Boolean);
  const segments = [];
  let buffer = '';
  for (const sentence of sentences) {
    if (sentence.length > max) {
      if (buffer) { segments.push(buffer); buffer = ''; }
      for (let index = 0; index < sentence.length; index += max) segments.push(sentence.slice(index, index + max));
      continue;
    }
    if (buffer && buffer.length + sentence.length > max) { segments.push(buffer); buffer = ''; }
    buffer += sentence;
  }
  if (buffer) segments.push(buffer);
  return segments.filter(Boolean);
}

module.exports = {
  BANKS, LEVELS, LEVEL_LABELS, textsFor, textAt, speedTextAt,
  SPEED_TARGET_CHARS, SEGMENT_MAX_CHARS, segmentText,
  passageLanguage, passageCatalog, passagesByIds, speedTextFromPassage
};
