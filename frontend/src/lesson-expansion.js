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
  ['设计与创作', 'design sketch layout color contrast space alignment typography shape texture image border shadow animation interface accessible readable consistent creative original revision', '设计 草图 布局 颜色 对比 留白 对齐 字体 形状 纹理 图像 边框 阴影 动画 界面 易用 可读 一致 创意 原创 修订'],
  ['数字生活', 'account password privacy device application website message search download upload camera battery charger signal connection update backup storage', '账号 密码 隐私 设备 应用 网站 消息 搜索 下载 上传 相机 电池 充电 信号 连接 更新 备份 存储'],
  ['校园活动', 'campus classroom workshop library cafeteria playground assembly club rehearsal exhibition competition schedule notice registration attendance certificate volunteer', '校园 教室 实训室 图书馆 食堂 操场 集会 社团 排练 展览 比赛 日程 通知 报名 签到 证书 志愿者'],
  ['食物与烹饪', 'rice noodle soup bread egg tomato potato carrot onion pepper salt sugar oil bowl plate spoon chopsticks kitchen recipe flavor fresh', '米饭 面条 汤水 面包 鸡蛋 番茄 土豆 胡萝卜 洋葱 辣椒 食盐 白糖 食油 饭碗 盘子 勺子 筷子 厨房 菜谱 味道 新鲜'],
  ['环保行动', 'recycle reduce reuse paper plastic glass metal rubbish bin energy electricity water bicycle public transport repair clean environment protect', '回收 减少 重复使用 纸张 塑料 玻璃 金属 垃圾箱 能源 电力 节水 单车 公共交通 修理 清洁 环境 保护'],
  ['沟通与礼仪', 'greeting introduction invitation request apology thanks reply conversation listening question explanation agreement disagreement patience respect kindness teamwork', '问候 介绍 邀请 请求 道歉 感谢 回复 交谈 倾听 提问 解释 同意 分歧 耐心 尊重 友善 团队合作'],
  ['音乐与艺术', 'rhythm melody instrument guitar piano drum concert stage audience painting brush canvas museum sculpture dance theater performance practice', '节奏 旋律 乐器 吉他 钢琴 鼓声 音乐会 舞台 观众 绘画 画笔 画布 博物馆 雕塑 舞蹈 剧场 演出 练习'],
  ['数学与逻辑', 'addition subtraction multiplication division fraction decimal percentage equation pattern sequence graph chart average estimate calculate compare prove', '加法 减法 乘法 除法 分数 小数 百分比 方程 规律 数列 图形 图表 平均值 估算 计算 比较 证明'],
  ['工具与维修', 'tool hammer screwdriver ruler scissors wire cable battery switch screw handle wheel machine inspect adjust replace tighten repair maintain', '工具 锤子 螺丝刀 尺子 剪刀 电线 线缆 电池 开关 螺钉 把手 轮子 机器 检查 调整 更换 拧紧 修理 维护'],
  ['城市公共服务', 'hospital clinic pharmacy post office bank police station fire station community center bus stop library park crossing service', '医院 诊所 药店 邮局 银行 派出所 消防站 社区中心 公交站 图书馆 公园 人行横道 公共服务'],
  ['目标与成长', 'goal effort routine focus habit progress challenge reflection confidence responsibility discipline persistence feedback achievement improvement future', '目标 努力 日常 专注 习惯 进步 挑战 反思 自信 责任 自律 坚持 反馈 成果 改进 未来']
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
    'Our project worked during the first demonstration, but using it revealed several problems. A button label was unclear, and an error message offered no useful advice. We invited two classmates to try the page while we quietly observed. Their pauses and questions helped us decide what to improve. We changed the labels, added guidance, and checked different window sizes. During the second demonstration, the task was much easier to complete. A working project becomes better when we understand the people who use it.'],
  ['食堂里的一次对话', 'A Conversation in the Cafeteria',
    '午饭时间，食堂里排起了长队。我前面的同学第一次来，不知道窗口分别供应什么。我先向他介绍今天的菜，再提醒他把餐盘放在指定的位置。轮到我们时，阿姨耐心说明哪道菜比较辣，还帮他换了一份清淡的汤。吃完以后，我们把桌面擦干净，把餐具送回回收处。一顿普通的午饭，因为几句清楚而友善的交流，变得更加顺利。',
    'The cafeteria was busy at lunchtime. A new student in front of me did not know what each counter served. I explained the menu and showed him where to place his tray. When our turn came, the cook told us which dish was spicy and offered a lighter soup. After eating, we cleaned the table and returned our dishes. Nothing unusual happened, yet a few clear and friendly sentences made the meal easier for someone who was still learning his way around campus.'],
  ['拍摄校园的一天', 'Photographing a Day on Campus',
    '摄影社准备做一组校园照片。早上，我们在操场记录同学们跑步的身影；中午，在树荫下拍到认真讨论作业的小组；傍晚，又看到实训室里仍亮着灯。整理照片时，我们没有只选最热闹的画面，也保留了安静阅读和仔细操作的瞬间。照片让人记住的，不只是建筑和活动，还有许多认真生活的人。',
    'Our photography club planned a small exhibition about campus life. In the morning, we photographed students running on the field. At noon, we found a group discussing homework beneath a tree. Later, the workshop lights were still on as students finished their projects. When choosing pictures, we kept quiet moments as well as busy ones. A student reading alone and a classmate carefully measuring a part both told important stories. The photographs showed a campus made lively by the people who learn and work there.'],
  ['修理一把旧椅子', 'Repairing an Old Chair',
    '教室里的一把椅子总是摇晃。我们先检查四条椅腿，发现一颗螺钉松了，还有一处木边需要打磨。大家找来合适的工具，固定螺钉，把粗糙的地方磨平，再坐上去试了几次。修好以后，椅子重新稳稳地放在课桌旁。这件小事提醒我们，发现问题后先查原因，选择合适的方法，比随手换一把新椅子更有收获。',
    'An old chair in our classroom kept shaking. We inspected its legs and found one loose screw and a rough wooden edge. With the right tools, we tightened the screw and smoothed the edge. Then we tested the chair several times before returning it to the desk. The repair was simple, but it required careful observation. We learned that solving a problem begins with finding its cause. Replacing an object immediately is not always the best answer when a small repair can make it useful again.'],
  ['整理电脑文件', 'Organizing Computer Files',
    '准备展示作品时，小组发现图片、文档和代码散落在不同文件夹里，有些文件还叫“最终版二”。我们先确定统一的命名规则，再把素材放进对应目录，删除重复副本，并备份重要成果。整理后，每个人都能很快找到需要的资料。一个清楚的文件结构不会替我们完成项目，却能减少寻找和沟通的时间，让合作更加可靠。',
    'Before presenting our project, we noticed that images, documents, and code were scattered across many folders. Several files had confusing names such as final version two. We agreed on a naming rule, placed materials in clear folders, removed duplicate copies, and backed up the important work. Afterward, everyone could find the right file quickly. An orderly folder structure does not finish a project for us, but it saves time and prevents mistakes when several people work together.'],
  ['运动会的下午', 'An Afternoon at the Sports Meet',
    '下午的运动会在热烈的加油声中开始。有人参加短跑，有人负责记录成绩，还有同学为选手递水。接力赛最后一棒出发时，大家都站了起来。获胜的队伍很开心，没拿到名次的同学也完成了自己的目标。活动结束后，我们一起收拾场地。比成绩更让人难忘的，是每个人都认真参与、互相鼓励的过程。',
    'The sports meet began on a warm afternoon. Some students ran short races, while others recorded results or brought water to the runners. Everyone stood up when the final runner in the relay took the baton. The winning team celebrated, but students who did not win had reasons to feel proud too. They had prepared, tried hard, and finished their events. At the end, we cleaned the field together. The most memorable part was the way classmates encouraged one another throughout the day.'],
  ['看懂天气预报', 'Reading the Weather Forecast',
    '周末出行前，我查看了天气预报。屏幕上不仅有温度，还有降雨概率、风速和空气质量。原计划下午去山上拍照，看到雷雨提示后，我们把活动改成上午的城市步行，并准备了雨具。实际天气没有完全按照预报变化，但提前了解信息帮助我们做出更稳妥的安排。面对数据，既要会读取，也要知道它表达的是可能性。',
    'Before a weekend trip, I checked the weather forecast. The screen showed temperature, chance of rain, wind speed, and air quality. We had planned to take photographs in the hills during the afternoon. After seeing a thunderstorm warning, we moved the walk to the morning and packed raincoats. The weather did not follow the forecast exactly, but the information helped us make a safer plan. A forecast describes possibilities, so we should understand the numbers and leave room to adjust our choices.'],
  ['周末的菜市场', 'A Visit to the Weekend Market',
    '周末早晨，菜市场里摆满了新鲜的蔬菜和水果。我按照购物清单挑选食材，比较价格，也向摊主请教哪种番茄适合煮汤。回家以后，我把食材分类清洗，与家人一起准备午饭。自己参与采购和做饭后，我更清楚一餐饭从哪里来，也学会在预算、口味和营养之间做简单的安排。',
    'The weekend market was full of fresh vegetables and fruit. I followed a shopping list, compared prices, and asked a seller which tomatoes were best for soup. At home, I washed the ingredients and helped my family prepare lunch. Shopping and cooking made me pay attention to the work behind an ordinary meal. I also learned to balance price, taste, and nutrition. A simple plan helped us buy what we needed without wasting food or money.'],
  ['给新同学带路', 'Showing a New Student Around',
    '开学第一天，一位新同学找不到实训楼。我没有只说“往前走”，而是陪他经过图书馆和操场，指出容易认错的路口。到了教室门前，我又告诉他食堂和办公室的位置。下午再次见面时，他已经能自己找到路线。把熟悉的地方讲清楚，需要站在第一次来的人角度思考；一次耐心的带路，也能让新环境少一点陌生。',
    'On the first day of term, a new student could not find the workshop building. Instead of giving a quick direction, I walked with him past the library and the sports field. I pointed out a corner where people often turn the wrong way. At the classroom, I also showed him where to find the cafeteria and the office. That afternoon, he followed the route by himself. Explaining a familiar place clearly requires us to imagine what it looks like to someone seeing it for the first time.']
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
