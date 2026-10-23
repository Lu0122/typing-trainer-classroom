const passages = [
  {
    title: 'Every Small Step Matters',
    category: '英文打字',
    content: 'Every small step matters when you are learning to type. Keep your hands relaxed, look at the screen, and let your fingers return to the home row after each word. Practice with patience, and your speed will grow with your confidence.'
  },
  {
    title: 'A Bright Day at School',
    category: '英文打字',
    content: 'A bright day at school begins with a clear plan. We read the task, organize our notes, and finish one thing at a time. Good typing is not only about speed; it is also about accuracy, rhythm, and focus.'
  },
  {
    title: '拼音基础练习',
    category: '拼音打字',
    content: 'ni hao tong xue，huan ying lai dao da zi lian xi。qing rang shuang shou fang zai ji zhun jian，kan qing ping mu shang de zi mu，zai an xia mei yi ge pin yin yin jie shi bao chi jie zou。'
  },
  {
    title: '校园生活拼音练习',
    category: '拼音打字',
    content: 'zao chen，xue sheng men dai zhe shu bao zou jin jiao shi。lao shi zhun bei hao jin tian de ke cheng，da jia an jing ting jiang，ren zhen wan cheng mei yi ge lian xi。'
  },
  {
    title: '清晨的校园',
    category: '校园生活',
    content: '清晨的校园刚刚醒来，教学楼前的树叶还挂着露水。第一缕阳光穿过窗户，落在整齐的课桌上。同学们背着书包走进教室，有人轻声朗读，有人整理笔记，也有人为今天的实训课做准备。铃声响起以后，走廊渐渐安静，新的学习任务就这样开始了。'
  },
  {
    title: '把小事做好',
    category: '成长励志',
    content: '真正的进步，往往藏在每天重复的小事里。认真听完一节课，独立解决一道难题，及时整理一次笔记，看起来都很普通，却能在时间里积累出力量。我们不必急着证明自己，只要把眼前的事情做扎实，把今天的自己向前推进一点点，答案自然会在未来出现。'
  },
  {
    title: '城市里的秋天',
    category: '生活随笔',
    content: '秋天来到城市时，并不会敲锣打鼓。也许只是晚风比昨天凉了一点，街边的树叶换了颜色，水果店里多了金黄的橘子。下班的人放慢脚步，路灯在傍晚提前亮起。季节用细微的变化提醒我们，忙碌之余也要留心身边那些安静而真实的美好。'
  },
  {
    title: '数字时代的学习',
    category: '科技阅读',
    content: '数字工具让知识变得触手可及，但真正有效的学习仍然需要专注。搜索可以快速找到答案，思考才能建立自己的理解；软件可以帮助记录，复盘才能让经验留下来。面对不断更新的技术，我们既要保持好奇，也要学会判断信息、提出问题，并在实践中验证想法。'
  },
  {
    title: '一分钟英文挑战·Keep Learning',
    category: '英文挑战',
    content: 'Learning a new skill is easier when we turn a large goal into small daily actions. A few minutes of focused practice can build a habit, and a good habit can change the way we work. When a mistake appears, do not rush to hide it. Read it carefully, find the reason, and try again with a calmer mind. Good typing is a balance of speed, accuracy, rhythm, and attention. Keep your hands relaxed, look at the screen, and let each correct word give you a little more confidence. Progress may feel slow at first, but every careful attempt leaves a useful trace. Stay patient, keep learning, and allow ordinary practice to create an extraordinary result.'
  },
  {
    title: '一分钟英文挑战·A Good Classroom',
    category: '英文挑战',
    content: 'A good classroom is built by everyone who enters it. Students bring questions, teachers bring experience, and patient practice connects the two. Before starting a task, read the instructions and decide what should be done first. During the work, keep your notes clear and check important details one more time. Asking for help is not a weakness when you are also willing to think and try. Sharing an idea can help a team discover a better path, while listening carefully can prevent small problems from becoming large ones. At the end of the lesson, review what you finished and choose one thing to improve tomorrow.'
  },
  {
    title: '一分钟英文挑战·A Walk in the City',
    category: '英文挑战',
    content: 'A walk through the city can become a quiet lesson in observation. The morning streets are filled with different sounds, from bicycles and buses to conversations outside a small shop. Trees change color as the seasons pass, while old buildings stand beside new offices and libraries. People hurry toward their work, yet a careful observer can still notice a child sharing an umbrella, a shopkeeper greeting a neighbor, or sunlight resting on a window. These small scenes remind us that learning is not limited to a classroom. Curiosity begins when we slow down, pay attention, and ask what the world is trying to tell us.'
  },
  {
    title: '一分钟拼音挑战·认真学习',
    category: '拼音挑战',
    content: '认真学习不是把所有时间都用来忙碌，而是知道每一段时间应该完成什么。开始练习以前，先看清任务要求，再把复杂的问题分成几个小步骤。遇到不会的地方，可以查阅资料，也可以向老师和同学请教，但最后要用自己的语言说出理解。一次输入错误并不可怕，重要的是找到原因并及时改正。只要每天坚持一点点，知识就会在重复和思考中慢慢变得牢固。学习技能的过程也许不快，却能让我们获得面对新问题的信心和耐心。'
  },
  {
    title: '一分钟拼音挑战·校园清晨',
    category: '拼音挑战',
    content: '清晨的校园从安静中慢慢醒来。教学楼前的树叶挂着露水，阳光穿过枝叶，在地面留下细碎的影子。同学们背着书包走进教室，有人整理今天的学习计划，有人打开电脑检查设备，也有人和朋友交流昨天遇到的问题。上课铃响以后，走廊渐渐安静下来，新的任务开始了。无论学习什么内容，都应该先听清要求，再认真完成每一个步骤。把小事做好，把细节记清楚，普通的一天也能留下真实的进步。'
  },
  {
    title: '一分钟拼音挑战·山水广西',
    category: '拼音挑战',
    content: '广西的山水有一种舒展而明亮的气质。清晨的江面升起薄雾，远处的山峰在水光中若隐若现，小船缓缓经过，划开一条安静的波纹。城市醒来以后，街巷里渐渐热闹起来，米粉店飘出香气，人们用熟悉的乡音互相问候。沿着公路向前，窗外会出现连绵的稻田、成片的果园和错落的村庄。年轻人学习知识、掌握技能，再把新的想法带回家乡。传统和现代在真实生活中相遇，让地方文化拥有新的表达，也让平凡的日子不断向前。'
  },
  {
    title: '一分钟挑战·校园与成长',
    category: '一分钟挑战',
    content: '校园生活像一本正在书写的书，每一天都有新的段落。清晨走进教室，我们打开电脑，检查设备，准备开始当天的学习。面对陌生的知识，不必因为暂时不懂而着急，先听清要求，再把任务分成几个小步骤，一步一步完成。遇到问题时，可以查阅资料，也可以和同学讨论，但最终要用自己的语言说出理解，用自己的双手完成实践。学习技术不仅是记住操作方法，更重要的是培养分析问题和解决问题的能力。一次输入错误、一次程序报错、一次作品修改，都是成长留下的痕迹。只要愿意认真观察，耐心尝试，就能从失败中找到线索。课间的时候，我们走到窗边，让眼睛休息片刻，也让思路重新变得清晰。下午的实训常常需要合作，有人负责整理资料，有人负责检查细节，有人负责展示成果。良好的合作不是简单地分配任务，而是及时沟通、互相补位，并对共同的结果负责。一天结束时，不妨回顾自己完成了什么，还有哪些地方可以改进。进步很少在一夜之间发生，它来自每一次准时开始、每一次专心练习和每一次认真收尾。把普通的小事做好，时间会给出可靠的答案。'
  },
  {
    title: '一分钟挑战·山水广西',
    category: '一分钟挑战',
    content: '广西的山水有一种舒展而明亮的气质。清晨的江面升起薄雾，远处的山峰在水光中若隐若现，小船缓缓经过，划开一条安静的波纹。城市醒来以后，街巷里渐渐热闹起来，米粉店飘出香气，人们用熟悉的乡音互相问候。沿着公路向前，窗外会出现连绵的稻田、成片的果园和错落的村庄。季节改变着土地的颜色，也带来不同的收获。春天播种希望，夏天守护生长，秋天分享果实，冬天整理一年的辛劳。这里既有古老的歌谣和手艺，也有不断延伸的高铁、桥梁与网络。传统和现代并不是彼此分开的两条路，它们在真实的生活中相遇，让地方文化拥有新的表达。年轻人学习知识、掌握技能，再把新的想法带回家乡；老师耐心讲解，帮助学生找到适合自己的方向；普通劳动者认真做好每一道工序，让一座城市稳定地向前运转。当晚霞落在骑楼和江岸上，散步的人放慢脚步，孩子们在广场上奔跑。平凡的日子因为人与人的连接而有了温度，也因为每个人踏实的努力而不断更新。'
  }
];

module.exports = { passages };
