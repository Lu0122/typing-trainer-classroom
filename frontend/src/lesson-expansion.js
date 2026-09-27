// Original practice material. Keep spaces when wrapping English paragraphs.
function lines(text, width, english = false) {
  const result = [];
  while (text.length) {
    let end = Math.min(width, text.length);
    if (english && end < text.length) {
      const space = text.lastIndexOf(' ', end);
      if (space > width / 2) end = space + 1;
    }
    result.push(text.slice(0, end)); text = text.slice(end);
  }
  return result;
}

const themes = [
  ['自然与四季', 'nature season spring summer autumn winter forest river mountain ocean island valley rain cloud sunshine wind flower leaf root seed garden grass wildlife sunrise sunset climate', '自然 四季 春天 夏日 秋天 冬雪 森林 河流 山峰 海洋 岛屿 山谷 雨水 云朵 阳光 微风 花朵 叶片 树根 种子 花园 草地 野生动物 日出 日落 气候'],
  ['运动与健康', 'sport health exercise running walking swimming cycling jumping stretching balance energy strength rest sleep breakfast nutrition vegetable fruit protein water habit safety training recovery', '运动 健康 锻炼 跑步 散步 游泳 骑行 跳跃 拉伸 平衡 活力 力量 休息 睡眠 早餐 营养 蔬菜 水果 蛋白质 饮水 习惯 安全 训练 恢复'],
  ['阅读与表达', 'reading library novel poetry chapter author reader character dialogue paragraph sentence meaning detail evidence opinion example explanation summary review discussion expression imagination', '阅读 图书馆 小说 诗歌 章节 作者 读者 人物 对话 段落 句子 含义 细节 证据 观点 例子 解释 摘要 书评 讨论 表达 想象'],
  ['交通与旅行', 'journey ticket station airport platform passenger driver route arrival departure luggage passport map direction distance destination bridge tunnel railway bicycle adventure explore', '旅程 车票 车站 机场 站台 乘客 司机 路线 到达 出发 行李 护照 地图 方向 距离 目的地 桥梁 隧道 铁路 自行车 探索 见闻'],
  ['科学与实验', 'science experiment observe measure record compare discover question hypothesis method sample temperature pressure volume weight instrument laboratory repeat conclusion reliable careful', '科学 实验 观察 测量 记录 比较 发现 问题 假设 方法 样本 温度 压力 体积 重量 仪器 实验室 重复 结论 可靠 严谨 探究'],
  ['职业与服务', 'career service customer colleague manager engineer designer developer technician nurse volunteer responsibility quality patience respect communication schedule delivery feedback improvement', '职业 服务 客户 同事 经理 工程师 设计师 开发者 技术员 护士 志愿者 责任 品质 耐心 尊重 沟通 日程 交付 反馈 改进'],
  ['编程与测试', 'variable constant function parameter return loop condition boolean string number array object module import export test assert debug compile runtime exception validation boundary', '变量 常量 函数 参数 返回 循环 条件 布尔 字符串 数字 数组 对象 模块 导入 导出 测试 断言 调试 编译 运行 异常 验证 边界'],
  ['设计与创作', 'design sketch layout color contrast space alignment typography shape texture image border shadow animation interface accessible readable consistent creative original revision', '设计 草图 布局 颜色 对比 留白 对齐 字体 形状 纹理 图像 边框 阴影 动画 界面 易用 可读 一致 创意 原创 修订']
];

const articles = [
  ['一次安静的阅读', 'A Quiet Reading Hour',
    '午后的图书馆里，窗边留着一张空桌。我选了一本关于自然观察的书，先翻目录，再读自己最感兴趣的章节。遇到不懂的词语，我没有急着跳过，而是把它记在纸上，联系前后的句子猜测含义。读完一页，我合上书，试着用自己的话说出作者的意思。这样读得并不快，却能发现许多原来没有留意的细节。离开时，我只借走了一本书，却带回了几个值得继续思考的问题。阅读的收获，有时正是从这些问题开始的。',
    'I found a quiet desk beside the library window and opened a book about nature. Before reading, I looked through the contents and chose a chapter that interested me. When an unfamiliar word appeared, I wrote it down and used the surrounding sentences to understand it. After each page, I closed the book and explained the main idea in my own words. This was slower than simply turning pages, but I remembered much more. I left the library with one book and several questions to explore the next day.'],
  ['从一粒种子开始', 'Growing a Small Garden',
    '班级在窗台上种了几盆小植物。第一次浇水时，大家都希望种子第二天就能发芽。老师提醒我们，生长需要合适的阳光、水分和时间。于是，小组制作了一张观察表，每天记录土壤的状态和叶片的变化。有一盆长得慢，我们一起检查位置，发现它总被窗帘遮住。调整之后，新叶终于舒展开来。这次种植让我们明白，努力不是不停地增加动作，而是认真观察条件，找到需要改变的地方，再耐心等待结果。',
    'Our class planted a few seeds in small pots near the window. At first, we wanted to see leaves immediately. We soon learned that growth needs light, water, and time. Each group kept a notebook to record changes. One plant grew slowly because a curtain blocked the sunlight. After we moved it, new leaves began to open. Caring for the garden taught us to observe before taking action. Doing more is not always helpful; sometimes a small change in the right place makes the greatest difference.'],
  ['小组里的好问题', 'Asking Better Questions',
    '实训开始后，我们的小组遇到了一个反复出现的问题。有人建议重新安装所有软件，也有人想直接换一台电脑。组长请大家先描述现象：什么时候出错，之前做了什么，哪些步骤能够正常完成。我们把答案逐条写下来，再用最简单的输入进行测试。很快，问题缩小到一个没有检查的参数。修改之后，程序正常运行了。大家把排查过程整理进记录，留给下次参考。一个清楚的问题，往往比许多仓促的尝试更能帮助团队找到方向。',
    'During a practical lesson, our group met an error that appeared again and again. Instead of changing everything, we described exactly when it happened. We listed the steps that worked and tested the smallest possible example. Soon we found a parameter that had not been checked. After correcting it, the program ran successfully. We recorded both the cause and the solution. A clear question helped us more than many hurried guesses. The next time a similar problem appears, our notes will give the team a useful starting point.'],
  ['每天留一点时间', 'Making Time to Practice',
    '我曾经把练习安排在所有事情结束以后，结果总是没有时间。后来，我尝试每天晚饭前留出十分钟，只完成一个小目标。开始时是熟悉几个键位，之后是准确输入一段话。练习结束，我记录最容易出错的地方，第二天再专门练习。偶尔状态不好，我会放慢速度，不急着追赶数字。几周以后，我发现双手比以前放松，注意力也更稳定。习惯不是一天建立的，但一个具体而能坚持的安排，可以让进步真正发生。',
    'I used to leave practice until everything else was finished, so I rarely had time for it. Then I reserved ten minutes before dinner and chose one small goal for each session. I began with a few keys and gradually moved to short paragraphs. After practicing, I noted the mistakes that needed attention. On difficult days, I slowed down instead of chasing a score. A few weeks later, my hands felt more relaxed and my attention lasted longer. A practical routine made steady improvement possible.'],
  ['一次志愿服务', 'Helping at a Community Event',
    '周末，我们到社区参加志愿服务。我的任务是引导来访者填写信息，并帮助他们找到对应的服务台。最初，我只顾着快速说明步骤，发现有些老人仍然不清楚该怎么做。后来，我放慢语速，一次只解释一个步骤，等对方完成后再继续。遇到自己不能解决的问题，就及时请工作人员协助。活动结束时，桌上的材料整齐了，队伍也有序了。这次经历让我体会到，认真倾听和清楚表达，同样是一种需要练习的能力。',
    'At a community event, I helped visitors find the right service desk. At first, I explained every step too quickly. Some older visitors still looked confused. I learned to speak slowly, explain one step at a time, and wait for a response. When a question was beyond my knowledge, I asked a staff member for help. By the end of the morning, the queue was orderly and the forms were organized. The experience showed me that careful listening and clear explanations are skills worth practicing.'],
  ['把作品做好一点', 'Improving a Small Project',
    '项目第一次运行成功时，大家都很高兴。但真正试用以后，我们发现按钮的文字不够清楚，错误提示也没有说明解决办法。小组邀请两位同学体验，安静观察他们操作，再记录停顿和疑问。我们根据这些记录修改页面，补上必要的说明，重新检查不同大小的窗口。第二次展示时，同学们更容易完成任务了。完成一个作品并不只是让它能够运行，还需要站在使用者的位置，看看它是否清楚、方便、可靠。',
    'Our project worked during the first demonstration, but using it revealed several problems. A button label was unclear, and an error message offered no useful advice. We invited two classmates to try the page while we quietly observed. Their pauses and questions helped us decide what to improve. We changed the labels, added guidance, and checked different window sizes. During the second demonstration, the task was much easier to complete. A working project becomes better when we understand the people who use it.']
];

export function expandPracticeBank(english, pinyin) {
  for (const [title, words, chinese] of themes) {
    english['english-word'].push({ title: '单词练习', selector: title, content: words, note: '' });
    pinyin['pinyin-word'].push({ level: '第三关', title: '词组练习', selector: title, lines: lines(chinese, 34) });
  }
  for (const [title, enTitle, chinese, englishText] of articles) {
    english['english-article'].push({ title: '文章练习', selector: enTitle, lines: lines(englishText, 62, true), note: '' });
    pinyin['pinyin-article'].push({ level: '第四关', title: '文章练习', selector: title, lines: lines(chinese, 36) });
    english['english-phrase'].push({ title: '语句练习', selector: enTitle + ' · 句子', content: englishText.split(/(?<=\.)\s+/).slice(0, 4).join(' '), note: '' });
  }
}
