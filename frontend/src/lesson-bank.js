const keyMeta = {
  KeyA:['A','左手小指'],KeyS:['S','左手无名指'],KeyD:['D','左手中指'],KeyF:['F','左手食指'],KeyG:['G','左手食指'],
  KeyH:['H','右手食指'],KeyJ:['J','右手食指'],KeyK:['K','右手中指'],KeyL:['L','右手无名指'],Semicolon:['；','右手小指'],
  KeyQ:['Q','左手小指'],KeyW:['W','左手无名指'],KeyE:['E','左手中指'],KeyR:['R','左手食指'],KeyT:['T','左手食指'],
  KeyY:['Y','右手食指'],KeyU:['U','右手食指'],KeyI:['I','右手中指'],KeyO:['O','右手无名指'],KeyP:['P','右手小指'],
  KeyZ:['Z','左手小指'],KeyX:['X','左手无名指'],KeyC:['C','左手中指'],KeyV:['V','左手食指'],KeyB:['B','左手食指'],
  KeyN:['N','右手食指'],KeyM:['M','右手食指'],Comma:['，','右手中指'],Period:['。','右手无名指'],Slash:['／','右手小指'],
  Digit1:['1','左手小指'],Digit2:['2','左手无名指'],Digit3:['3','左手中指'],Digit4:['4','左手食指'],Digit5:['5','左手食指'],
  Digit6:['6','右手食指'],Digit7:['7','右手食指'],Digit8:['8','右手中指'],Digit9:['9','右手无名指'],Digit0:['0','右手小指'],
  Quote:['’','右手小指'],Minus:['－','右手小指'],Equal:['＝','右手小指'],BracketLeft:['［','右手小指'],BracketRight:['］','右手小指'],Backslash:['＼','右手小指']
};

// Standard touch-typing assignment used by the lesson copy, keyboard target and hand guide.
export const fingerKeyByCode = {
  KeyQ:'left-pinky', KeyA:'left-pinky', KeyZ:'left-pinky', Digit1:'left-pinky',
  KeyW:'left-ring', KeyS:'left-ring', KeyX:'left-ring', Digit2:'left-ring',
  KeyE:'left-middle', KeyD:'left-middle', KeyC:'left-middle', Digit3:'left-middle',
  KeyR:'left-index', KeyT:'left-index', KeyF:'left-index', KeyG:'left-index', KeyV:'left-index', KeyB:'left-index', Digit4:'left-index', Digit5:'left-index',
  KeyY:'right-index', KeyU:'right-index', KeyH:'right-index', KeyJ:'right-index', KeyN:'right-index', KeyM:'right-index', Digit6:'right-index', Digit7:'right-index',
  KeyI:'right-middle', KeyK:'right-middle', Comma:'right-middle', Digit8:'right-middle',
  KeyO:'right-ring', KeyL:'right-ring', Period:'right-ring', Digit9:'right-ring', Space:'thumbs',
  KeyP:'right-pinky', Semicolon:'right-pinky', Slash:'right-pinky', Quote:'right-pinky', Digit0:'right-pinky', Minus:'right-pinky', Equal:'right-pinky', BracketLeft:'right-pinky', BracketRight:'right-pinky', Backslash:'right-pinky'
};

function buildKeys(codes, length) {
  const result=[];
  for(let i=0;i<length;i++) {
    const block=Math.floor(i/codes.length);
    const order=block%3===1?[...codes].reverse():block%3===2?[...codes.slice(2),...codes.slice(0,2)]:codes;
    const code=order[i%codes.length], [label,finger]=keyMeta[code];
    result.push({code,label,finger,fingerKey:fingerKeyByCode[code] || ''});
  }
  return result;
}

export const beginnerLessons = [
  {title:'基准键位',hint:'ASDF JKL；',items:buildKeys(['KeyA','KeyS','KeyD','KeyF','KeyJ','KeyK','KeyL','Semicolon'],128)},
  {title:'上排字母',hint:'QWERTY UIOP',items:buildKeys(['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP'],140)},
  {title:'下排字母',hint:'ZXCV BNM',items:buildKeys(['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM'],126)},
  {title:'数字键位',hint:'1—0 数字排',items:buildKeys(['Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0'],120)},
  {title:'标点符号',hint:'常用中英文标点',items:buildKeys(['Comma','Period','Slash','Semicolon','Quote','Minus','Equal','BracketLeft','BracketRight','Backslash'],120)},
  {title:'全键混合',hint:'字母、数字、标点综合练习',items:buildKeys(Object.keys(keyMeta),180)},
  {title:'左右交替',hint:'左右手交替与节奏训练',items:buildKeys(['KeyF','KeyJ','KeyD','KeyK','KeyS','KeyL','KeyA','Semicolon','KeyG','KeyH'],200)},
  {title:'跨排伸展',hint:'食指与中指跨排移动',items:buildKeys(['KeyF','KeyR','KeyV','KeyJ','KeyU','KeyM','KeyD','KeyE','KeyC','KeyK','KeyI','Comma'],216)},
  {title:'数字字母混合',hint:'字母和数字交替输入',items:buildKeys(['KeyA','Digit1','KeyB','Digit2','KeyC','Digit3','KeyD','Digit4','KeyE','Digit5','KeyF','Digit6','KeyG','Digit7','KeyH','Digit8','KeyI','Digit9','KeyJ','Digit0'],240)}
];

export const extraEnglishCopy = {
  'english-word': [
    {title:'单词练习',selector:'校园常用词',content:'school student teacher classroom lesson practice answer question notebook computer keyboard screen project group partner morning afternoon study learn read write speak listen think',note:'school：n.学校；study：v.学习'},
    {title:'单词练习',selector:'计算机常用词',content:'code program system server client network browser database table field file folder command terminal error message result input output create update delete search',note:'program：n.程序；network：n.网络'},
    {title:'单词练习',selector:'日常生活词',content:'family friend breakfast lunch dinner water fruit market street city weather season morning evening weekend travel music movie picture story happy careful quiet',note:'careful：adj.仔细的'},
    {title:'单词练习',selector:'动作词汇',content:'begin continue finish choose check change improve remember understand prepare organize compare explain solve build connect return follow share help wait move',note:'improve：v.改进；提高'},
    {title:'单词练习',selector:'品质与感受',content:'accurate patient focused relaxed confident friendly honest helpful active creative clear simple strong useful important different possible ready successful',note:'accurate：adj.准确的'},
    {title:'单词练习',selector:'综合高频词',content:'because before after during between around through without together again always sometimes usually quickly slowly correctly carefully finally already enough',note:'together：adv.一起'}
  ],
  'english-phrase': [
    {title:'语句练习',selector:'课堂口语',content:'Please open your book. Read the question carefully. Work with your partner. Check your answer again. Ask the teacher for help. Finish the task on time.',note:''},
    {title:'语句练习',selector:'日常问候',content:'Good morning. Nice to meet you. How was your day? Thank you for your help. Please take care. See you tomorrow.',note:''},
    {title:'语句练习',selector:'学习鼓励',content:'Keep going. You can do it. Practice makes progress. Learn from every mistake. Stay calm and focused. Small steps matter.',note:''},
    {title:'语句练习',selector:'团队合作',content:'Let us work together. Please share your idea. I agree with your plan. We can solve this problem. Check every detail. The team is ready.',note:''},
    {title:'语句练习',selector:'时间安排',content:'Start with a clear plan. Do one thing at a time. Take a short break. Come back with fresh eyes. Review your work before leaving.',note:''},
    {title:'语句练习',selector:'电脑操作',content:'Turn on the computer. Open the project folder. Enter the correct command. Save the file carefully. Read the error message. Run the program again.',note:''}
  ],
  'english-article': [
    {title:'文章练习',selector:'Practice Every Day',lines:['Typing becomes easier when practice is part of your daily routine.','Begin slowly and make accuracy your first goal. Keep your hands','relaxed, look at the screen, and return your fingers to the home','row after every word. A short focused practice each day is more','useful than one long and hurried practice at the end of the week.','Stay patient and let steady progress build your confidence.'],note:''},
    {title:'文章练习',selector:'Working as a Team',lines:['A good team listens before making a decision. Every member can','bring a different idea, skill, or experience to the same task.','Clear communication helps the group notice problems early and','share the work fairly. When the project is finished, the team','should review both the result and the process. This turns one','successful task into useful experience for the next challenge.'],note:''},
    {title:'文章练习',selector:'Learning from Errors',lines:['An error message is not the end of a programming task. It is a','clue that tells us where to look and what to check. Read each','message carefully, find the related line, and change one thing at','a time. Testing after every small change makes the real cause','easier to discover. Calm thinking often solves a problem faster','than repeating the same command without understanding it.'],note:''},
    {title:'文章练习',selector:'A Quiet Morning',lines:['The campus is quiet before the first class begins. Sunlight falls','across the desks while students prepare books, notes, and laptops.','Someone reads yesterday’s lesson, and someone checks the equipment','for a practical task. When the bell rings, conversations become','soft and the new lesson begins. A clear morning plan helps everyone','use time well and complete the day with confidence.'],note:''},
    {title:'文章练习',selector:'Digital Learning',lines:['Digital tools make information easier to find, but effective','learning still needs attention and judgment. Search can provide','many answers, yet thinking helps us decide which answer is useful.','Software can record our work, while review turns that work into','experience. We learn technology best when we ask questions, test','ideas, and explain the result in our own words.'],note:''}
  ]
};

const syllableSet=(selector,pairs,target)=>({level:'第二关',title:'音节练习',selector,syllables:pairs.map(([pinyin,hanzi])=>({pinyin,hanzi})),target});
export const extraPinyinCopy = {
  'pinyin-syllable': [
    syllableSet('声母巩固一',[['q','七'],['w','我'],['e','鹅'],['r','日'],['t','特'],['y','一'],['u','乌'],['i','衣'],['o','喔'],['p','坡']],'qwertyuiop'),
    syllableSet('声母巩固二',[['a','啊'],['s','思'],['d','得'],['f','佛'],['g','哥'],['h','喝'],['j','家'],['k','科'],['l','了'],['m','摸']],'asdfghjklm'),
    syllableSet('下排巩固',[['z','字'],['x','西'],['c','次'],['v','鱼'],['b','玻'],['n','呢'],['m','摸'],['a','啊'],['s','思'],['d','得']],'zxcvbnmasd')
  ],
  'pinyin-word': [
    {level:'第三关',title:'词组练习',selector:'校园词组',lines:['校园 教室 老师 学生 课程 作业 实训 课堂 课间 书本 黑板','电脑 键盘 鼠标 屏幕 文件 程序 网络 数据 项目 小组 作品','认真 听讲 思考 练习 复习 预习 提问 回答 讨论 展示 总结','按时 完成 检查 修改 保存 提交 记录 整理 计划 目标 进步','同学 伙伴 合作 交流 帮助 分享 负责 耐心 专注 自信 成长']},
    {level:'第三关',title:'词组练习',selector:'城市生活',lines:['清晨 阳光 街道 公园 商店 市场 车站 广场 社区 图书馆','公交 地铁 单车 行人 红灯 绿灯 路口 桥梁 高楼 小巷 江边','早餐 午餐 晚餐 米粉 水果 蔬菜 茶水 面包 牛奶 鸡蛋','天气 春天 夏天 秋天 冬天 晴朗 阴天 小雨 微风 凉爽','城市 生活 工作 学习 休息 运动 阅读 音乐 电影 旅行']},
    {level:'第三关',title:'词组练习',selector:'技术词组',lines:['人工智能 数据分析 软件开发 网络安全 云端服务 移动应用','需求分析 系统设计 编写代码 调试程序 运行测试 部署项目','用户登录 权限管理 数据查询 文件上传 信息提示 错误处理','团队协作 版本管理 任务分工 项目展示 作品验收 学习复盘','发现问题 分析原因 提出方案 动手实践 检查结果 持续改进']},
    {level:'第三关',title:'词组练习',selector:'成长词组',lines:['明确目标 制定计划 按时开始 保持专注 独立思考 主动提问','认真观察 耐心尝试 及时记录 反复练习 总结经验 改进方法','面对困难 保持冷静 寻找线索 解决问题 完成任务 分享成果','尊重他人 真诚交流 互相帮助 团结合作 勇于负责 坚持到底','每天进步 积累知识 掌握技能 建立信心 迎接挑战 创造未来']},
    {level:'第三关',title:'词组练习',selector:'广西文化',lines:['壮乡山歌 铜鼓文化 民族服饰 风雨桥梁 稻田果园 山水风光','桂林山水 漓江清晨 北海银滩 德天瀑布 龙脊梯田 骑楼老街','柳州螺蛳粉 桂林米粉 梧州龟苓膏 南宁老友粉 横州茉莉花','传统手艺 地方语言 节庆活动 民间故事 历史建筑 文化传承','家乡发展 青年学习 技能成才 服务社会 建设广西 美好生活']}
  ],
  'pinyin-article': [
    {level:'第四关',title:'文章练习',selector:'认真练习',lines:['真正的进步，往往来自每天认真完成的小练习。开始时不必追求很快，先把','每一个字打准确，把双手放在正确的位置，把目光留在屏幕上。出现错误时，','停下来看看原因，再重新输入一次。稳定的节奏会慢慢形成肌肉记忆，准确率','提高以后，速度也会自然增长。只要每天坚持十分钟，回头看时就会发现，','曾经需要思考很久的键位，已经能够轻松而自然地完成。']},
    {level:'第四关',title:'文章练习',selector:'团队实训',lines:['实训课上，一个完整的项目通常需要大家共同完成。开始之前，小组先读清楚','任务要求，再讨论功能、页面和数据分别由谁负责。开发过程中，每个人都要','及时说明进度和遇到的问题，不能等到最后才发现接口和页面无法配合。完成','自己的任务以后，还要帮助队友检查细节。良好的合作不是简单分工，而是对','共同的结果负责，让每一部分最终能够稳定地运行。']},
    {level:'第四关',title:'文章练习',selector:'数字时代',lines:['数字工具让知识变得触手可及，但真正有效的学习仍然需要专注和判断。搜索','可以快速找到许多答案，思考才能帮助我们理解其中的联系。软件可以保存和','整理资料，复盘才能让经验真正留下来。面对不断更新的技术，我们要保持好','奇，也要学会验证信息、提出问题，并在实践中说明自己的判断。会使用工具','只是开始，能够解决真实问题才是学习技术的重要目标。']},
    {level:'第四关',title:'文章练习',selector:'清晨校园',lines:['清晨的校园刚刚醒来，教学楼前的树叶还挂着露水。阳光穿过窗户，落在整','齐的课桌和键盘上。同学们背着书包走进教室，有人轻声朗读，有人整理笔记，','也有人提前检查实训设备。铃声响起以后，走廊渐渐安静，新的学习任务开始','了。把一天的第一件事认真做好，后面的节奏就会更加清楚，也更容易保持专','注，在普通的日子里留下真实而可靠的进步。']},
    {level:'第四关',title:'文章练习',selector:'山水家乡',lines:['广西的山水有一种舒展而明亮的气质。清晨的江面升起薄雾，远处的山峰在','水光中若隐若现，小船缓缓经过，划开一条安静的波纹。城市醒来以后，街巷','里渐渐热闹起来，米粉店飘出香气，人们用熟悉的乡音互相问候。传统文化和','现代生活在这里相遇，年轻人学习知识、掌握技能，再把新的想法带回家乡，','让平凡的日子因为每个人踏实的努力而不断更新。']}
  ]
};
