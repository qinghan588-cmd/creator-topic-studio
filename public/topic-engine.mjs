/** Browser / Node compatible local inspiration engine. No network or model calls. */
const GOALS = ['涨粉', '互动', '转化'];
const TONES = ['真诚分享', '实用干货', '观点表达'];

function plainText(value, maxLength = 120) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

export function normalizeProfile(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    niche: plainText(source.niche) || '职场 AI 与效率工具',
    audience: plainText(source.audience, 160) || '希望提高工作效率的职场新人',
    platform: '公众号',
    goal: GOALS.includes(source.goal) ? source.goal : '涨粉',
    tone: TONES.includes(source.tone) ? source.tone : '真诚分享',
    keywords: plainText(source.keywords, 300),
    material: plainText(source.material, 6000),
  };
}

const PACKS = [
  {
    test: /美妆|护肤|彩妆|化妆|底妆|口红|妆容/,
    focuses: ['日常底妆', '基础护肤', '彩妆选择', '通勤妆容', '化妆台整理'],
    scenario: '早上准备出门', task: '复现一个日常妆容',
    pain: '步骤越叠越多，妆面却不稳定',
    criteria: ['已有产品能否完成', '实际准备时间', '在自然光下的呈现', '自己的使用感受'],
    evidence: '同一光线下的过程图、实际使用步骤和你自己的使用感受',
    tags: ['美妆思路', '日常分享', '化妆记录'],
  },
  {
    test: /穿搭|服装|衣服|衣橱|搭配|时尚/,
    focuses: ['通勤穿搭', '衣橱整理', '基础款搭配', '配色选择', '换季穿搭'],
    scenario: '准备第二天的出门搭配', task: '用已有衣服完成一套搭配',
    pain: '衣服不少，出门前还是不知道穿什么',
    criteria: ['实际穿着场合', '已有衣物利用率', '活动时的舒适度', '搭配和打理成本'],
    evidence: '衣物清单、实际搭配照片和对应的穿着场景',
    tags: ['穿搭思路', '衣橱整理', '日常搭配'],
  },
  {
    test: /美食|做饭|烹饪|食谱|一人食|备菜|厨房|咖啡|烘焙/,
    focuses: ['工作日晚餐', '一人食备菜', '厨房工具', '食材利用', '家常快手菜'],
    scenario: '下班回家准备晚餐', task: '用现有食材做一顿饭',
    pain: '做饭花了很久，收拾厨房还要再来一轮',
    criteria: ['食材是否容易准备', '实际操作步骤', '厨具和清洁成本', '口味与份量是否合适'],
    evidence: '食材用量、实际操作照片和完整过程记录',
    tags: ['日常做饭', '厨房记录', '生活灵感'],
  },
  {
    test: /旅行|旅游|攻略|出行|露营|徒步|城市漫步|探店/,
    focuses: ['周末短途出行', '行李整理', '路线安排', '城市漫步', '旅行信息核对'],
    scenario: '安排一次周末出行', task: '排一条符合自己节奏的路线',
    pain: '收藏了很多攻略，却排不出合适的行程',
    criteria: ['可支配的时间', '路线衔接和交通', '开放信息是否已核对', '个人体力与同行需求'],
    evidence: '实际走过的路线、现场照片，以及标注查询日期的官方信息',
    tags: ['出行思路', '周末计划', '旅行记录'],
  },
  {
    test: /健身|运动|跑步|瑜伽|力量|拉伸|骑行/,
    focuses: ['日常运动安排', '运动记录', '跑步准备', '运动装备', '训练时间管理'],
    scenario: '在工作日留出一段运动时间', task: '完成一次适合自己的运动安排',
    pain: '计划排得很满，实际执行却总被打断',
    criteria: ['自己的时间安排', '当前经验和体力', '场地与装备要求', '完成后的真实感受'],
    evidence: '一次真实的运动记录、执行条件和个人感受，不许诺体重或体型变化',
    tags: ['运动日常', '习惯记录', '运动计划'],
  },
  {
    test: /家居|收纳|租房|装修|家务|居家|清洁/,
    focuses: ['桌面收纳', '租房布置', '家务安排', '小空间利用', '日常清洁'],
    scenario: '整理一处经常使用的小空间', task: '把一处杂乱区域整理到方便使用',
    pain: '刚整理完很整齐，用几次又乱了',
    criteria: ['真实使用频率', '取放是否顺手', '现有空间和物品', '后续维护的时间'],
    evidence: '同一角度的前后照片、物品清单和使用一段时间后的记录',
    tags: ['居家日常', '收纳思路', '生活整理'],
  },
  {
    test: /AI|人工智能|效率|职场|办公|工具|工作流|笔记|软件/i,
    focuses: ['AI 工作流', '效率工具', '周报整理', '会议纪要', '信息归档'],
    scenario: '处理一项反复出现的工作', task: '把零散信息整理成可执行的清单',
    pain: '工具越来越多，重复工作却没有减少',
    criteria: ['实际解决的任务', '输入与输出是否清楚', '修改和返工成本', '能否在下次继续复用'],
    evidence: '一段脱敏后的真实输入、完整操作步骤，以及实际输出和修改记录',
    tags: ['效率工具', '工作方法', 'AI 应用'],
  },
];

function domainPack(profile) {
  // A kitchen-storage account is about keeping a space usable, not recipes.
  const match = /收纳|家居|台面/.test(profile.niche) ? PACKS[5] : PACKS.find((pack) => pack.test.test(profile.niche));
  if (match) return match;
  return {
    focuses: [profile.niche, `${profile.niche}入门`, `${profile.niche}的选择方法`, `${profile.niche}实践`, `${profile.niche}常见问题`],
    scenario: `面对一个与${profile.niche}有关的具体需求`,
    task: `完成一件与${profile.niche}有关的小事`,
    pain: '看过很多建议，仍不知道从哪里开始',
    criteria: ['具体需求是什么', '现有条件能否满足', '需要投入多少时间', '如何判断是否适合自己'],
    evidence: '真实的操作过程、可核对的原始资料和你的判断依据',
    tags: [profile.niche, '实用分享', '经验记录'],
  };
}

function keywordsFor(profile) {
  return [...new Set(profile.keywords.split(/[，,、;；\n|#]+/).map((word) => word.trim()).filter(Boolean))].slice(0, 8);
}

const SUBJECT_LABELS = {
  台面: '台面整理', 桌面: '桌面收纳', 厨房: '厨房收纳', 衣柜: '衣柜整理',
  衣橱: '衣橱整理', 冰箱: '冰箱收纳', 阳台: '阳台布置', 口红: '口红选择',
  耳机: '耳机选购', 工具: '工具选择', AI: 'AI 办公应用', 笔记: '笔记整理',
  信息: '信息整理', 素材: '素材整理', 会议纪要: '会议纪要整理', 周报: '周报整理',
};

const DOMAIN_DETAILS = [
  { journey: '从现有产品到适合自己的日常步骤', firstStep: '从已有产品和日常场景开始', decision: '先看场景、步骤与自己的使用感受', question: '已有产品怎么搭配，步骤又该如何取舍？', problem: '步骤越来越多，为什么妆面反而不稳定？' },
  { journey: '从已有衣物到一套出门搭配', firstStep: '先看穿着场合，再整理已有衣物', decision: '先看场合、舒适度与打理成本', question: '基础款怎么搭配，哪些衣服值得留下？', problem: '衣服不少，为什么出门前还是不知道穿什么？' },
  { journey: '从现有食材到一顿工作日晚餐', firstStep: '从手头食材和可用时间开始', decision: '先看食材、步骤与清洁成本', question: '怎样准备食材，才能少一些临时手忙脚乱？', problem: '做饭不难，为什么准备和收拾占了那么多时间？' },
  { journey: '从零散攻略到一条适合自己的路线', firstStep: '先确定时间和同行需求', decision: '先看交通、开放信息与个人节奏', question: '攻略怎么筛选，路线又该怎样取舍？', problem: '攻略收藏了很多，为什么行程还是排不出来？' },
  { journey: '从可用时间到一次能完成的运动安排', firstStep: '从当前体力和实际时间开始', decision: '先看经验、时间与场地条件', question: '时间不固定时，运动应该怎样安排？', problem: '计划排得很满，为什么执行时总被打断？' },
  { journey: '从物品分类到顺手取放', firstStep: '先看每天用什么，再决定放哪里', decision: '先看使用频率、空间与归位难度', question: '常用物品放哪里，才能方便使用和归位？', problem: '刚整理完很整齐，为什么用几次又乱了？' },
  { journey: '从零散信息到可执行的工作清单', firstStep: '从一项反复出现的工作开始', decision: '先看任务、返工与后续复用成本', question: '怎样判断工具是在省事，还是在增加整理工作？', problem: '工具越来越多，为什么重复工作却没减少？' },
];

const SUBJECT_DETAILS = [
  {
    test: /台面|厨房收纳|厨房整理/,
    task: '让厨房台面留下常用物品和足够的操作空间',
    scenario: '做饭和清洁时取放常用物品',
    pain: '收纳盒买了不少，厨房台面却仍然拥挤',
    criteria: ['常用物品的拿取顺序', '备菜和清洁所需的操作空间', '物品尺寸与存放位置', '用完后归位是否方便'],
    evidence: '同一角度的台面照片、常用物品清单和实际取放记录',
    journey: '从物品分类到顺手归位', firstStep: '先留出操作空间，再安排常用物品',
    decision: '先看使用频率和操作动线', question: '哪些物品留在台面上，哪些需要另找位置？',
    problem: '收纳盒越来越多，为什么操作空间反而变小了？',
  },
  {
    test: /工作流|自动化/,
    task: '把会议记录整理成有负责人和截止时间的待办清单',
    scenario: '会后整理零散记录并确认下一步行动',
    pain: 'AI 生成了摘要，下一步该由谁做什么却仍然不清楚',
    criteria: ['原始记录是否完整', '待办信息是否需要人工确认', '是否能交付给实际使用的人', '同类任务能否复用这套步骤'],
    evidence: '脱敏后的原始会议记录、生成的待办清单和人工核对记录',
    journey: '从会议记录到待办清单', firstStep: '先走通一项重复任务，再考虑自动化',
    decision: '先看输入、人工核对和最终交付', question: '什么时候适合自动化，什么时候需要人工确认？',
    problem: '有了会议摘要，为什么还是不知道下一步做什么？',
  },
  {
    test: /信息|归档|收藏|笔记|素材/,
    task: '把零散收藏整理成下次能找到的资料库',
    scenario: '保存网页、截图和零散笔记',
    pain: '资料越存越多，真正需要时却找不到',
    criteria: ['能否按实际任务找到资料', '每次整理需要多少时间', '重复内容如何合并', '换工具时能否保留原始数据'],
    evidence: '一份脱敏的收藏清单、实际查找路径和整理前后的目录',
    journey: '从零散收藏到找得到的资料库', firstStep: '先解决找不到，再考虑分得细',
    decision: '文件夹、标签与搜索该怎样分工', question: '标签、文件夹和搜索，应该先解决哪一个？',
    problem: '收藏了很多资料，为什么需要时还是找不到？',
  },
  {
    test: /会议纪要/,
    task: '把原始记录整理成结论、待办和待确认问题',
    scenario: '会后交付一份能继续推动工作的会议纪要',
    pain: '纪要写得很长，却看不出需要谁跟进',
    criteria: ['结论和讨论过程是否分开', '待办是否有明确负责人', '不确定内容是否单独标注', '参会人能否快速核对'],
    evidence: '脱敏会议记录、纪要草稿和参会人确认后的改动',
    journey: '从讨论记录到结论和待办', firstStep: '先分清结论、待办和待确认问题',
    decision: '先看可核对性，而不是字数多少', question: '哪些内容该保留，哪些问题必须再确认？',
    problem: '纪要写了很多，为什么没有人知道该跟进什么？',
  },
  {
    test: /周报/,
    task: '把本周任务写成有进展、问题和下一步的周报',
    scenario: '周末回顾零散的任务记录',
    pain: '列了很多做过的事，重点进展却没有说清楚',
    criteria: ['任务记录是否完整', '进展是否有可核对的依据', '问题是否需要他人协助', '下一步行动是否具体'],
    evidence: '脱敏任务记录、实际交付物和周报草稿',
    journey: '从任务流水账到清晰的工作进展', firstStep: '先理清进展和问题，再组织文字',
    decision: '先看进展、问题和下一步行动', question: '事情很多时，怎样写出重点和下一步？',
    problem: '列满了做过的事，为什么还是看不出重点？',
  },
  {
    test: /效率工具|办公软件|软件|工具|ChatGPT|Notion|Obsidian/i,
    task: '为一项重复工作选择并试用合适的工具',
    scenario: '考虑替换正在使用的办公工具',
    pain: '换了工具，原有工作还是要重新整理一遍',
    criteria: ['当前最常重复的任务', '导入、整理和修改的成本', '是否需要团队协作', '数据能否导出和迁移'],
    evidence: '真实任务、试用过程，以及导入和导出数据的记录',
    journey: '从需求清单到一次实际试用', firstStep: '先列重复任务，再决定要不要换工具',
    decision: '先看任务、协作和迁移成本', question: '免费版、协作功能和迁移成本，应该先看什么？',
    problem: '换了新工具，为什么还要重复整理原来的工作？',
  },
];

function subjectFor(rawFocus, pack) {
  const compact = rawFocus.replace(/\s+/g, '');
  const label = SUBJECT_LABELS[rawFocus] || SUBJECT_LABELS[compact] || rawFocus;
  const fallback = {
    journey: '从具体需求到一个可以开始的方案', firstStep: '先明确自己遇到的具体问题',
    decision: '先比较实际需要、现有条件与投入', question: '怎样开始、如何选择、什么时候调整？',
    problem: '看过很多建议，为什么仍不知道从哪里开始？',
  };
  const details = DOMAIN_DETAILS[PACKS.indexOf(pack)] || fallback;
  const specific = SUBJECT_DETAILS.find((item) => item.test.test(label));
  return { ...pack, ...details, ...specific, label };
}

function hash(value) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
  return result.toString(36);
}

function shorten(text, length) {
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

const GOAL_REASONS = {
  涨粉: '把一个明确的小问题讲透，让第一次看到账号的人知道你能提供什么。',
  互动: '给出具体的讨论条件，邀请读者补充自己的场景，避免只有空泛的“你怎么看”。',
  转化: '先说清适用条件和选择标准，帮助有需要的读者判断是否值得进一步了解。',
};

const PLAN_TYPES = [
  {
    category: '实用干货',
    titles: (f, p) => [`${f}入门：${p.firstStep}`, `${f}入门：${p.journey}`, `${f}从哪里开始？先明确一个实际需求`],
    angle: (f, p) => `围绕“${p.task}”展开一套有起点、有结果的操作方法。`,
    hook: (f, p) => `如果你也需要${p.task}，不妨先从手头的条件出发。${p.firstStep}，比一次安排好全部细节更容易开始。`,
    outline: (f, p) => [`第一段｜先理清起点：结合“${p.scenario}”，说明手头有哪些条件、需要得到什么结果。`, `第二段｜分步完成任务：围绕“${p.task}”展示具体步骤，以及每一步要确认的内容。`, '第三段｜核对是否够用：把结果与原来的需求对照，说明还需要调整的地方。'],
    reason: '问题具体、步骤可执行，适合读者带着需求搜索和回看。',
  },
  {
    category: '避坑指南',
    titles: (f, p) => [`${f}遇到问题，先从哪里查起？`, `${f}：${p.problem}`, `${f}没达到预期？从条件、步骤和结果排查`],
    angle: (f, p) => `从“${p.pain}”出发，排查过程而不是归咎于读者。`,
    hook: (f, p) => `${p.pain}？先把条件、步骤和结果分开看，可能更容易找到卡点。`,
    outline: (f, p) => [`第一段｜问题出现在哪里：以“${p.pain}”为切口，区分表面现象与可能的原因。`, `第二段｜排查具体环节：对照${p.criteria[0]}、${p.criteria[1]}，找出可以验证的卡点。`, '第三段｜先调整一件事：根据真实过程提出一项改动，并说明如何观察它是否有帮助。'],
    reason: '把常见困惑拆成可检查的细节，比只说“坚持”更容易帮助读者。',
  },
  {
    category: '清单合集',
    titles: (f, p) => [`${f}的四个判断标准：从自己的需求出发`, `${f}：${p.decision}`, `${f}选择清单：哪些条件需要先确认？`],
    angle: (f) => `给${f}建立选择标准，不做缺少依据的“最佳”排行。`,
    hook: (f, p) => `关于${f}的建议很多，但每个人的条件并不一样。如果眼下需要${p.task}，可以先从四个判断标准开始比较。`,
    outline: (f, p) => p.criteria.map((criterion, index) => `第${['一', '二', '三', '四'][index]}段｜${criterion}：解释它为什么影响选择，用一个可核对的例子说明如何判断。`),
    reason: '能变成读者自己的决策表，便于收藏，也方便后续做有证据的对比。',
  },
  {
    category: '观点讨论',
    titles: (f) => [`关于${f}，哪些投入是你真正需要的？`, `${f}的取舍：哪些值得投入，哪些可以暂缓？`, `${f}需要做到哪一步，才能满足自己的需求？`],
    angle: (f) => `讨论${f}适合哪些人、在什么条件下可以暂时不做。`,
    hook: (f, p) => `关于${f}，值得先问的问题也许不是“别人都怎么选”，而是“我眼下需要解决什么”。如果只是为了${p.task}，哪些投入已经够用，哪些可以稍后再考虑？`,
    outline: (f, p) => [`第一段｜需求不相同：以“${p.scenario}”为例，说明不同条件为什么会带来不同选择。`, `第二段｜区分必要与可选：结合${p.criteria[0]}和${p.criteria[2]}，解释投入的取舍。`, '第三段｜留下适用范围：给出有条件的判断，邀请读者补充自己遇到的情况。'],
    reason: '围绕具体条件表达观点，讨论更有内容，也能体现账号的判断方式。',
  },
  {
    category: '真实记录',
    titles: (f, p) => [`${f}实践：一个具体任务的完整过程`, `${f}实践：${p.journey}`, `${f}的过程记录：开始、调整与结果`],
    angle: (f) => `先实际完成一次${f}相关任务，再用过程和证据组织内容。`,
    hook: (f, p) => `如果目标是${p.task}，从开始到完成会经历哪些步骤？一份完整的过程记录，可以帮助我们看清${f}需要什么条件，以及哪些地方仍需要调整。`,
    outline: (f, p) => [`第一段｜开始时的条件：写清任务“${p.task}”、限制条件和预期结果。`, '第二段｜实际发生的调整：完成任务后再写，保留关键步骤、遇到的困难和确实做过的改动。', '第三段｜结果与不足：展示能核对的结果，只写观察到的事实，不把个人体验推成普遍结论。'],
    reason: '真实过程能成为账号自己的素材，后续还可以复盘和继续追踪。',
  },
  {
    category: '实用干货',
    titles: (f, p) => [`${f}的具体步骤：${p.task}`, `${f}上手：${p.firstStep}`, `${f}的实际应用：${p.journey}`],
    angle: (f, p) => `用“${p.scenario}”串起${f}的输入、步骤和结果。`,
    hook: (f, p) => `需要${p.task}时，第一步究竟该做什么？从真实场景拆开${f}的步骤，会比记住一串技巧更容易用到下一次。`,
    outline: (f, p) => [`第一段｜准备哪些东西：为了${p.task}，先列出需要的信息、物品和限制。`, `第二段｜按顺序完成：围绕${p.scenario}，说明每一步的操作和需要检查的结果。`, '第三段｜留下复用清单：把已经核对过的步骤归纳成一份可填写、可调整的清单。'],
    reason: '以真实场景组织内容，比把所有技巧一次铺开更容易看懂。',
  },
  {
    category: '清单合集',
    titles: (f) => [`${f}准备清单：需求、现有条件与完成标准`, `${f}开始前，有哪些事情需要先确认？`, `${f}的三项准备：明确需求，盘点条件，定好标准`],
    angle: (f) => `把${f}所需的准备工作分为需求、条件和检查标准。`,
    hook: (f, p) => `准备${p.task}时，先确认三个问题：需要解决什么，手头已经有什么，以及做到什么程度就够用。答案清楚了，后面的选择也会有依据。`,
    outline: (f, p) => [`第一段｜需要解决什么：结合“${p.scenario}”明确具体需求，而不只是列一个宽泛的目标。`, `第二段｜手头已经有什么：盘点可用的时间、物品、信息，以及暂时无法改变的限制。`, '第三段｜怎样算完成：给出可以核对的标准，同时说明哪些调整可以留到以后。'],
    reason: '把抽象建议变成可填写的准备清单，适合持续更新成一个内容系列。',
  },
  {
    category: '观点讨论',
    titles: (f) => [`${f}的时间成本，不只在执行那一步`, `${f}的时间账：准备、执行与后续维护`, `关于${f}，哪些时间值得花，哪些可以少花？`],
    angle: (f) => `把${f}的准备、执行和维护放在一起讨论。`,
    hook: (f) => `评价${f}时，我们常只看到最后的效果。准备、修改和维护的时间，也应该算进来。`,
    outline: (f) => [`第一段｜列出完整过程：梳理${f}从准备到后续维护的环节，不先假定哪一步最耗时。`, '第二段｜对照真实记录：挑一段自己确实记录过的过程，说明投入与产出之间的取舍。', '第三段｜提出可调整的部分：给出有条件的判断，邀请读者分享最想减少的那个环节。'],
    reason: '讨论具体的时间分配，容易引出有场景、有差异的真实反馈。',
  },
  {
    category: '避坑指南',
    titles: (f) => [`采纳${f}建议之前，先核对三个条件`, `${f}建议为什么不一定适合你？先看条件差异`, `同样一条${f}建议，为什么会有不同的结果？`],
    angle: (f) => `解释${f}建议的适用范围，给读者一份自查方法。`,
    hook: (f) => `一条${f}建议可能没错，但它默认的条件，未必和你的情况一样。`,
    outline: (f, p) => [`第一段｜需求是否一致：建议解决的问题，与“${p.task}”的需求相同吗？`, `第二段｜条件是否一致：对照${p.criteria[1]}和${p.criteria[2]}，解释差异会怎样影响判断。`, '第三段｜证据是否足够：区分真实过程、个人意见与尚未验证的推测，再给出适用范围。'],
    reason: '给出判断建议的方法，能体现内容的可靠性，也避免一刀切。',
  },
  {
    category: '实用干货',
    titles: (f, p) => [`关于${f}的三个常见问题`, `${f}问答：${p.question}`, `${f}问答：怎样开始、如何判断、何时调整`],
    angle: (f) => `围绕${f}整理三个可回答的具体问题，用问答结构展开一篇文章。`,
    hook: (f, p) => `关于${f}，一个值得先想清楚的问题是：${p.question}如果眼下需要${p.task}，可以把困惑拆开，分别看条件、方法和判断标准。`,
    outline: (f, p) => [`第一问｜${p.question}结合“${p.scenario}”说明需求和限制。`, `第二问｜怎样迈出第一步？围绕“${p.task}”解释所需条件与具体步骤。`, '第三问｜怎样判断是否适合我？给出可核对的标准，并说明需要继续观察的部分。'],
    reason: '问答结构适合展开读者常见困惑，也方便在文末收集下一篇文章的问题。',
  },
  {
    category: '真实记录',
    titles: (f) => [`${f}复盘：哪些步骤值得留下，哪些可以删掉？`, `${f}复盘：开始的目标与实际的结果`, `回看${f}的过程：哪些问题解决了，哪些还没有？`],
    angle: (f) => `基于一次确实完成的${f}实践，讨论保留、调整和停止。`,
    hook: (f, p) => `完成${p.task}之后，还有一个值得回看的问题：哪些步骤真的帮上了忙？${f}的结果之外，过程中的取舍也值得留意。`,
    outline: () => ['第一段｜回顾目标与结果：根据实际记录，说明哪些地方已经做到、哪些还没做到。', '第二段｜分清保留与调整：分别列出值得保留、需要调整、可以停止的一项具体步骤。', '第三段｜确定下一次的小改动：解释准备怎么观察它是否有帮助，不先假定结果。'],
    reason: '同一个真实素材可以发展出第二篇内容，让账号积累连续的观察。',
  },
  {
    category: '观点讨论',
    titles: (f, p) => [`${f}做到什么程度，就已经够用了？`, `${f}的完成标准：怎样才算解决了实际问题？`, `${f}的取舍：为“${p.task}”做到哪一步？`],
    angle: (f) => `围绕${f}的完成标准，讨论“够用”与“继续完善”的边界。`,
    hook: (f, p) => `如果目标只是${p.task}，做到哪一步就可以先交付？先定标准，再判断还要不要继续。`,
    outline: (f, p) => [`第一段｜明确不可缺少的结果：从“${p.task}”出发，说明任务真正需要满足什么。`, `第二段｜分清功能与偏好：围绕${f}，区分影响使用的要求与可以稍后完善的部分。`, '第三段｜提出有边界的完成标准：说明它适合什么条件，并邀请不同需求的读者补充。'],
    reason: '有边界的观点能形成清晰表达，讨论也能围绕不同需求展开。',
  },
];

function materialHint(profile, pack) {
  if (!profile.material) return `写作前补充：${pack.evidence}。缺少实际记录时，先作为待验证的写作计划。`;
  const excerpt = profile.material.split(/[\n。！？!?]/).map((line) => line.trim()).find(Boolean) || profile.material;
  return `可用素材：「${shorten(excerpt, 100)}」。这是你提供的素材，引用前核对原始信息，并补充${pack.evidence}。`;
}

function hookForTone(hook, profile) {
  if (profile.tone === '实用干货') return `这篇只解决一个具体问题。${hook}`;
  if (profile.tone === '观点表达') return `先说判断依据，再给结论。${hook}`;
  return hook;
}

export function generateTopics(input = {}, seed = 0) {
  const profile = normalizeProfile(input);
  const pack = domainPack(profile);
  const keywords = keywordsFor(profile);
  const focuses = keywords.length ? keywords : pack.focuses;
  const batch = Number.isFinite(Number(seed)) ? Math.abs(Math.trunc(Number(seed))) : 0;
  const formats = { 实用干货: '方法文章', 避坑指南: '问题拆解', 清单合集: '清单文章', 观点讨论: '观点长文', 真实记录: '实践复盘' };
  const planOrder = [0, 1, 2, 3, 4, 5, 6, 9, 8, 7, 10, 11];
  const fingerprint = hash(JSON.stringify(profile));
  const topics = Array.from({ length: 9 }, (_, index) => {
    const plan = PLAN_TYPES[planOrder[(index + batch * 5) % planOrder.length]];
    const context = subjectFor(shorten(focuses[(index + batch) % focuses.length], 28), pack);
    const focus = context.label;
    const titleOptions = plan.titles(focus, context);
    const titles = [...new Set([titleOptions[(batch + 1) % 3], ...titleOptions])].map((title) => shorten(title, 72));
    const tagFocus = keywords.length ? keywords[index % keywords.length] : pack.tags[0];
    return {
      id: `topic-${fingerprint}-${batch}-${index + 1}`,
      title: titles[0],
      angle: plan.angle(focus, context),
      category: plan.category,
      format: plan === PLAN_TYPES[9] ? '读者问答' : formats[plan.category],
      reason: `面向${profile.audience}：${plan.reason} ${GOAL_REASONS[profile.goal]}`,
      hook: hookForTone(plan.hook(focus, context), profile),
      outline: plan.outline(focus, context),
      titles,
      tags: [...new Set([shorten(tagFocus, 22), pack.tags[1], profile.goal === '互动' ? '一起讨论' : pack.tags[2]])],
      effort: plan.category === '真实记录' ? '中' : '低',
      materialHint: materialHint(profile, context),
    };
  });
  const materialNote = profile.material ? '已把你提供的素材作为写作线索，使用前仍需核对。' : '建议先挑一个能用真实过程或资料支撑的小问题。';
  return {
    mode: 'template',
    analysis: `围绕「${profile.niche}」，为${profile.audience}规划 9 个${profile.platform}选题，以${profile.goal}为目标，覆盖方法、避坑、清单、观点和实践记录。${materialNote}这些是本地灵感模板，不代表实时热度或效果预测。`,
    topics,
  };
}
