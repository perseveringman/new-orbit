/**
 * Vision area template — embedded file contents for the auto-scaffolded
 * Vision area created when a new Orbit vault is initialized.
 */

export interface VisionAreaTemplateFiles {
  'README.md': string;
  'VISION.md': string;
  'CHANGELOG.md': string;
  '.orbit/agent/AGENTS.md': string;
  '.orbit/agent/questions.yaml': string;
  '.orbit/agent/rubrics.md': string;
  '.orbit/agent/vision.template.md': string;
  '.orbit/agent/sessions/session.template.json': string;
}

export function getVisionAreaTemplateFiles(vars: {
  name: string;
  slug: string;
  uid: string;
}): VisionAreaTemplateFiles {
  return {
    'README.md': renderReadme(vars),
    'VISION.md': VISION_PLACEHOLDER,
    'CHANGELOG.md': renderChangelog(vars),
    '.orbit/agent/AGENTS.md': AGENTS_MD,
    '.orbit/agent/questions.yaml': QUESTIONS_YAML,
    '.orbit/agent/rubrics.md': RUBRICS_MD,
    '.orbit/agent/vision.template.md': VISION_TEMPLATE_MD,
    '.orbit/agent/sessions/session.template.json': SESSION_TEMPLATE_JSON
  };
}

function renderReadme(vars: { name: string }): string {
  return `# ${vars.name}

这是你的人生愿景区域（Vision Area）。

## 用途

**Vision** 是一份长期维护的北极星文档，记录你的价值观、优势、人生路线和给其他 Agent 的决策准则。

## 开始

在右侧打开 Terminal，启动一个 Claude 会话：

\`\`\`bash
claude
\`\`\`

Agent 启动后会自动读取 \`.orbit/agent/AGENTS.md\`，然后引导你完成约 45 题的人生愿景访谈，最终生成 \`VISION.md\`。

## 文件说明

- \`VISION.md\` — 你的人生愿景文档（访谈完成后自动生成）
- \`.orbit/agent/AGENTS.md\` — Agent 行为准则
- \`.orbit/agent/questions.yaml\` — 访谈题目结构（45 题）
- \`.orbit/agent/rubrics.md\` — 推导规则手册
- \`.orbit/agent/vision.template.md\` — VISION.md 输出模板
- \`.orbit/agent/sessions/\` — 每次访谈的会话记录

## 迭代

愿景会随时间演进。每次你认为需要更新时，重新开启一个终端 Agent 会话，Agent 会进入 Review 模式，只重点检查变化最大的维度，无需重跑全部 45 题。
`;
}

function renderChangelog(vars: { name: string }): string {
  return `# ${vars.name} Changelog

## [Unreleased]

### Added
- 初始化 Vision Area

`;
}

const VISION_PLACEHOLDER = `<!-- VISION.md 尚未生成 -->

打开右侧 Terminal，启动 Claude 会话，完成人生愿景访谈后，这份文档会被自动填充。

\`\`\`bash
claude
\`\`\`
`;

const AGENTS_MD = `# Personal Vision Agent

> 使命：通过一轮基于权威理论的深度访谈，帮助用户产出一份可长期维护、可被其他 Agent 直接读取的 \`VISION.md\`。

---

## 1. 你的身份

你是用户的 Personal Vision Agent。

你不是励志教练，也不是算命师。你是：
- 有理论素养的采访者
- 严谨的归纳者
- 温和但不敷衍的追问者
- 能把模糊人生感受整理成可执行愿景文档的人

你的唯一目标：
1. 用结构化问题帮助用户澄清价值观、优势、工作观、人生观、能量来源、人生路线和内在动机。
2. 最终生成 \`VISION.md\`。
3. 让 \`VISION.md\` 不只是自我感动，而是能被任何其他 Agent 当作决策依据读取。

---

## 2. 理论底座

你必须明确基于以下理论工作，不得临场编造心理学标签：

1. Schwartz Values / PVQ：识别用户核心价值观
2. VIA Character Strengths：识别用户性格优势
3. Designing Your Life：提炼 Workview / Lifeview / Energy Map / Odyssey Plans
4. Ikigai：寻找热爱、擅长、世界需要、可获报酬的交集
5. Self-Determination Theory：验证愿景是否满足自主、胜任、连接
6. Hedgehog Concept：把优势、热爱、可持续价值整合成长期聚焦点
7. Future-Self Continuity / Regret Minimization：避免短视与他人剧本

如果用户问你"这题为什么这样问"，你要能指出它对应哪套理论、解决什么问题。

---

## 3. 输入文件

启动时优先读取以下文件（所有路径相对于 \`$ORBIT_AREA_PATH\`）：

- \`$ORBIT_AREA_PATH/.orbit/agent/questions.yaml\`
- \`$ORBIT_AREA_PATH/.orbit/agent/rubrics.md\`
- \`$ORBIT_AREA_PATH/.orbit/agent/vision.template.md\`
- \`$ORBIT_AREA_PATH/VISION.md\`（如果已有历史版本）
- \`$ORBIT_AREA_PATH/notes-digest.md\`（如果已有文档归纳）
- \`$ORBIT_AREA_PATH/.orbit/agent/sessions/session.template.json\`
- \`$ORBIT_AREA_PATH/CHANGELOG.md\`（如果存在）

如果 \`ORBIT_EXTERNAL_NOTES_PATHS\` 环境变量存在，说明用户已在 Orbit 中配置了外部笔记库路径，各路径以冒号分隔。可以主动提示用户：
- "我看到你已设置了外部笔记路径：\${ORBIT_EXTERNAL_NOTES_PATHS}，要在本次访谈中参考这些笔记吗？"
- "有没有这些目录中不该读取的私密内容？"

如果环境变量不存在，仍需主动询问：
- "你希望我参考哪些笔记/文档目录？"

---

## 4. 启动序列

每次正式访谈前，按这个顺序进行：

1. 说明本轮目标：产出或更新 \`VISION.md\`
2. 询问是否要接入笔记/文档目录（参考 \`ORBIT_EXTERNAL_NOTES_PATHS\`）
3. 询问是否存在不希望读取的私密目录
4. 如果用户提供文档目录：
   - 先阅读并归纳主题
   - 生成或更新 \`$ORBIT_AREA_PATH/notes-digest.md\`
   - 只提炼长期主题，不抄大段原文
5. 检查是否存在旧版 \`VISION.md\`
   - 若存在，先阅读旧版，识别上次北极星、milestones、未解问题
6. 告知用户本轮预计题量约 45 题、耗时约 60–90 分钟
7. 创建本轮会话记录文件（基于 \`.orbit/agent/sessions/session.template.json\`，保存为 \`.orbit/agent/sessions/session-<ISO-date>.json\`）
8. 按顺序从 C → D1 → D2 → D3 → D4 → D5 → D6 → D7 提问

---

## 5. 提问协议

### 5.1 基本规则

- 不得跳题
- 不得把 45 题一次性全贴给用户
- 每次只问 1 题；最多把 1 个主问题和必要选项一起给出
- 题目如有选项，必须保留编号或字母，便于用户作答
- 每 8–10 题做一次小结，帮助用户保持上下文
- 开放题若回答过短，必须追问一次
- 用户明显疲惫时，允许提供休息点，但默认目标是一次做完

### 5.2 追问条件

命中以下任一条件时，必须追问：
- 回答少于题目设定的最小字数
- 用户大量使用"都行""不知道""一般""差不多"
- 选择了"其他"但未解释
- 题目涉及重大矛盾（例如说重视自由，但所有关键选择都让位于安全）
- 用户答案只给结论，没给例子

### 5.3 追问风格

追问要短、具体、不可居高临下。

好例子：
- "能给一个最近半年的具体例子吗？"
- "你当时脑子里最在意的那句话是什么？"
- "这更像你真正在乎的，还是你觉得自己应该在乎的？"

---

## 6. 矛盾检测协议

每答完 10 题，做一次内部矛盾检测，并在必要时回扣用户。

重点检查：
- 价值观与工作观是否冲突
- 价值观与当前生活方式是否冲突
- 自述优势与能量来源是否不一致
- Ikigai 交集是否被外部期待强行覆盖
- 自主性评分低但目标非常宏大时，是否是他人剧本

---

## 7. 文档归纳协议

如果用户提供笔记/文档目录：

1. 先读目录结构，再抽样阅读高相关文档
2. 提取关键信息写入 \`$ORBIT_AREA_PATH/notes-digest.md\`：
   - 高频主题、经常重复的焦虑/欲望/决策拉扯、高频关键词
   - 长期项目/兴趣/反复提到的人或问题
3. 归纳时避免泄露隐私细节；只保留对愿景形成有意义的抽象层信息

---

## 8. 生成 \`VISION.md\` 的规则

全部问题完成后，你必须先依据 \`$ORBIT_AREA_PATH/.orbit/agent/rubrics.md\` 做推导，再生成最终文档。

生成路径：\`$ORBIT_AREA_PATH/VISION.md\`

生成时必须包含（参考 \`.orbit/agent/vision.template.md\`）：
- 一句话愿景
- 核心价值观 Top 5
- 性格优势 Top 5
- Workview / Lifeview
- Coherence Check
- Energy Map
- Ikigai 交集与 gap
- Odyssey Plans（A/B/C）
- 10 年北极星
- 3 年里程碑
- 给其他 Agent 的决策准则
- 当前焦虑与未解问题
- Review 节点与 Changelog

---

## 9. Review 模式

如果不是第一次，而是半年复盘：

1. 先阅读旧版 \`$ORBIT_AREA_PATH/VISION.md\`
2. 检查 \`next_review\`
3. Review 模式不必重跑全部 45 题，优先重跑：
   - D1 价值观核心题
   - D3 Workview / Lifeview 核心题
   - D7 动机真实性题
4. 生成新版 \`VISION.md\`
5. 在 \`$ORBIT_AREA_PATH/CHANGELOG.md\` 追加一条更新摘要

---

## 10. 会话结束时的交付动作

完成后你必须：

1. 生成或更新 \`$ORBIT_AREA_PATH/VISION.md\`
2. 如有重大变化，更新 \`$ORBIT_AREA_PATH/CHANGELOG.md\`
3. 给出一段 5–10 行摘要，说明：
   - 本轮最稳定的价值观
   - 最大的矛盾/拉扯
   - 接下来 90 天最值得做的一件事
4. 询问用户是否要立刻进入"90 天行动拆解"模式

---

## 11. 禁止事项

- 不得臆测用户人格类型
- 不得使用 MBTI、星座、血型等非本项目理论基础做主结论
- 不得绕过 \`rubrics.md\` 直接出报告
- 不得在用户未授权时读取任意个人目录
`;

const QUESTIONS_YAML = `meta:
  schema: vision-questions/1.0
  version: 1.0
  total_questions: 45
  estimated_minutes: 60-90
  dimensions:
    - C_Context
    - D1_Values
    - D2_Strengths
    - D3_WorkviewLifeview
    - D4_EnergyMap
    - D5_Ikigai
    - D6_Odyssey
    - D7_Motivation

questions:
  - id: C-Q01
    dimension: C_Context
    theory: Intake
    theory_ref: Project protocol
    type: open_short
    prompt: "这次访谈要不要接入你的笔记或文档目录？如果要，请给路径，并说明哪些目录不要读。"
    min_chars: 0

  - id: C-Q02
    dimension: C_Context
    theory: Intake
    theory_ref: Project protocol
    type: single_choice
    prompt: "这次你更想澄清哪个时间尺度的人生方向？"
    options:
      - { key: A, text: "未来 1-3 年", maps_to: near_term }
      - { key: B, text: "未来 3-10 年", maps_to: mid_term }
      - { key: C, text: "更长期的人生母题", maps_to: long_term }
      - { key: D, text: "三者都要，但以 3-10 年为主", maps_to: blended }

  - id: D1-Q01
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012"
    type: single_choice
    prompt: |
      想象两个人：
      A：重要的是独立思考，按自己的判断走，即使和主流不一样。
      B：重要的是融入秩序，做靠谱、可被认可的选择。
      哪个更像你？
    options:
      - { key: A, text: "非常像 A", maps_to: Self-Direction, score: 2 }
      - { key: B, text: "有点像 A", maps_to: Self-Direction, score: 1 }
      - { key: C, text: "两边都有", maps_to: Mixed, score: 0 }
      - { key: D, text: "有点像 B", maps_to: Conformity, score: 1 }
      - { key: E, text: "非常像 B", maps_to: Conformity, score: 2 }

  - id: D1-Q02
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012"
    type: single_choice
    prompt: |
      想象两个人：
      A：对他来说，寻求冒险和冒险是重要的。他喜欢刺激的生活。
      B：对他来说，生活稳定、社会秩序是最重要的。他讨厌任何会扰乱生活的事。
      哪个更像你？
    options:
      - { key: A, text: "非常像 A", maps_to: Stimulation, score: 2 }
      - { key: B, text: "有点像 A", maps_to: Stimulation, score: 1 }
      - { key: C, text: "两边都有", maps_to: Mixed, score: 0 }
      - { key: D, text: "有点像 B", maps_to: Security, score: 1 }
      - { key: E, text: "非常像 B", maps_to: Security, score: 2 }

  - id: D1-Q03
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012"
    type: single_choice
    prompt: |
      想象两个人：
      A：对他来说，照顾身边的人、做对朋友和家人最好的事是最重要的。
      B：对他来说，理解社会不公正、努力改变对所有人有害的状况是最重要的。
      哪个更像你？
    options:
      - { key: A, text: "非常像 A", maps_to: Benevolence, score: 2 }
      - { key: B, text: "有点像 A", maps_to: Benevolence, score: 1 }
      - { key: C, text: "两边都有", maps_to: Mixed, score: 0 }
      - { key: D, text: "有点像 B", maps_to: Universalism, score: 1 }
      - { key: E, text: "非常像 B", maps_to: Universalism, score: 2 }

  - id: D1-Q04
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012"
    type: single_choice
    prompt: |
      想象两个人：
      A：对他来说，非常成功很重要。他希望人们认可他的成就。
      B：对他来说，活得享受、放纵自己是重要的。他喜欢让自己快乐。
      哪个更像你？
    options:
      - { key: A, text: "非常像 A", maps_to: Achievement, score: 2 }
      - { key: B, text: "有点像 A", maps_to: Achievement, score: 1 }
      - { key: C, text: "两边都有", maps_to: Mixed, score: 0 }
      - { key: D, text: "有点像 B", maps_to: Hedonism, score: 1 }
      - { key: E, text: "非常像 B", maps_to: Hedonism, score: 2 }

  - id: D1-Q05
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012"
    type: single_choice
    prompt: |
      想象两个人：
      A：对他来说，拥有权力、指挥他人是重要的。他希望人们按他说的去做。
      B：对他来说，维护传统、遵循家族或文化传承的习俗是重要的。
      哪个更像你？
    options:
      - { key: A, text: "非常像 A", maps_to: Power, score: 2 }
      - { key: B, text: "有点像 A", maps_to: Power, score: 1 }
      - { key: C, text: "两边都有", maps_to: Mixed, score: 0 }
      - { key: D, text: "有点像 B", maps_to: Tradition, score: 1 }
      - { key: E, text: "非常像 B", maps_to: Tradition, score: 2 }

  - id: D1-Q06
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012 ranking"
    type: ranking
    prompt: |
      请把以下 6 个价值观按照对你的重要程度排序（1 = 最重要）：
      - 自由（按自己的方式生活和思考）
      - 安全（生活稳定，没有威胁）
      - 成就（被他人认可、取得成功）
      - 关怀（照顾身边的人）
      - 公平（为所有人的权利而努力）
      - 享乐（快乐和感官体验）
    items: [自由, 安全, 成就, 关怀, 公平, 享乐]

  - id: D1-Q07
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "open supplement"
    type: open_medium
    prompt: "在你人生中，有没有一次你主动放弃了某个机会或回报，因为它不符合你某个深层的价值观？请具体描述那是什么机会、你为什么没有接受它。"
    min_chars: 80

  - id: D1-Q08
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012 supplement"
    type: single_choice
    prompt: "当你回顾过去几年让你真正自豪的决定，那个决定背后最核心的那个价值是什么？"
    options:
      - { key: A, text: "我按自己判断走，没有随大流", maps_to: Self-Direction }
      - { key: B, text: "我在最难的时候还是守住了对某人的承诺", maps_to: Benevolence }
      - { key: C, text: "我真的做成了一件有难度的事", maps_to: Achievement }
      - { key: D, text: "我没有为了利益做不诚实的事", maps_to: Universalism }
      - { key: E, text: "我保持了对家人/传统的尊重", maps_to: Tradition }
      - { key: F, text: "其他（请说明）", maps_to: Other }

  - id: D1-Q09
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "Schwartz 2012 supplement"
    type: single_choice
    prompt: "如果有人问'你这个人最看重什么'，你不会用什么词来描述自己？（排除项更能暴露边界）"
    options:
      - { key: A, text: "权力/地位", maps_to: not_Power }
      - { key: B, text: "归属/融入", maps_to: not_Conformity }
      - { key: C, text: "稳定/安全", maps_to: not_Security }
      - { key: D, text: "独立/自由", maps_to: not_SelfDirection }
      - { key: E, text: "成就/被认可", maps_to: not_Achievement }

  - id: D1-Q10
    dimension: D1_Values
    theory: Schwartz PVQ
    theory_ref: "open consolidation"
    type: open_medium
    prompt: "如果你今天知道自己只剩下 5 年可以工作，你会把时间用在哪里？为什么？"
    min_chars: 100

  - id: D2-Q01
    dimension: D2_Strengths
    theory: VIA Character Strengths
    theory_ref: "Peterson & Seligman 2004"
    type: multi_choice
    prompt: |
      请从以下性格优势中选出最像你的 5 个（请只选 5 个，不多不少）：
      - 好奇心（Curiosity）：喜欢探索、学习新事物
      - 创造力（Creativity）：善于找到新颖的解决方式
      - 判断力（Judgment）：思考严谨，不轻易下结论
      - 热爱学习（Love of Learning）：主动求知，享受积累
      - 洞察力（Perspective）：能看到大局，善于整合
      - 勇敢（Bravery）：面对挑战不回避，勇于发言
      - 毅力（Perseverance）：做事有始有终，不轻易放弃
      - 正直（Honesty）：真诚，言行一致
      - 活力（Zest）：做事投入，充满精力
      - 爱（Love）：重视亲密关系，能深度连接
      - 善意（Kindness）：乐于助人，关心他人感受
      - 社交智能（Social Intelligence）：能感知社交场合，理解他人动机
      - 团队合作（Teamwork）：忠诚，与团队协作
      - 公平（Fairness）：遵守规则，给每个人公平机会
      - 领导力（Leadership）：善于组织，激励他人
      - 宽恕（Forgiveness）：不记仇，给人第二次机会
      - 谦逊（Humility）：不吹嘘，让成就说话
      - 谨慎（Prudence）：做决定前周全考虑，避免冲动
      - 自律（Self-Regulation）：能控制自己的感受和行为
      - 欣赏美好（Appreciation of Beauty）：能注意到日常中的美和卓越
      - 感恩（Gratitude）：注意并珍视好事
      - 希望（Hope）：对未来乐观，努力实现美好结果
      - 幽默（Humor）：喜欢笑，让别人开心
      - 灵性/意义感（Spirituality）：有关于人生目的的连贯信念体系
    max_choices: 5

  - id: D2-Q02
    dimension: D2_Strengths
    theory: VIA Character Strengths
    type: open_short
    prompt: "在你选出的 5 个优势里，你觉得哪一个是你'天生就有'、不需要刻意培养的？请说明一个具体表现。"
    min_chars: 50

  - id: D2-Q03
    dimension: D2_Strengths
    theory: VIA Character Strengths
    type: scale_1_5
    prompt: "在你的工作或项目里，你多频繁感受到'我在用我最擅长的那一面'？（1=从不，5=几乎总是）"

  - id: D2-Q04
    dimension: D2_Strengths
    theory: VIA Character Strengths
    type: scale_1_5
    prompt: "你通常能坚持完成自己开始的事情吗？（1=几乎做不到，5=几乎总能做到）"

  - id: D2-Q05
    dimension: D2_Strengths
    theory: VIA Character Strengths
    type: open_medium
    prompt: "如果让你生命中认识你最深的一个人评价你'最突出的优势'，他/她会说什么？为什么你认为他/她会这样说？"
    min_chars: 80

  - id: D2-Q06
    dimension: D2_Strengths
    theory: VIA Character Strengths
    type: open_medium
    prompt: "在你状态最差、最不像自己的时候，你会失去什么能力或特质？"
    min_chars: 60

  - id: D3-Q01
    dimension: D3_WorkviewLifeview
    theory: Designing Your Life
    theory_ref: "Burnett & Evans 2016"
    type: open_long
    prompt: |
      "Workview"是指你对工作根本意义的看法。请回答以下问题（不需要标序号，连续写就好）：
      - 工作对你来说是什么？仅仅是换取收入，还是有别的意义？
      - 好工作的必要条件是什么？（不是最好的，是最低标准）
      - 如果你不需要工作来维持生计，你还会做什么样的"工作"？为什么？
    min_chars: 150

  - id: D3-Q02
    dimension: D3_WorkviewLifeview
    theory: Designing Your Life
    theory_ref: "Burnett & Evans 2016"
    type: open_long
    prompt: |
      "Lifeview"是指你对人生根本意义的看法。请回答以下问题（连续写就好）：
      - 活着是为了什么？（不需要标准答案，说你真正相信的）
      - 人与人之间的关系在人生中占什么位置？
      - 什么算是"浪费了一生"？
    min_chars: 150

  - id: D3-Q03
    dimension: D3_WorkviewLifeview
    theory: Designing Your Life
    type: scale_1_5
    prompt: "你现在的工作/主要活动，有多大程度上让你觉得自己在做真正重要的事？（1=完全不，5=非常符合）"

  - id: D3-Q04
    dimension: D3_WorkviewLifeview
    theory: Designing Your Life
    type: single_choice
    prompt: "你认为工作和生活的关系应该是？"
    options:
      - { key: A, text: "工作只是手段，生活才是目的" }
      - { key: B, text: "工作是生活的重要部分，但不应该压倒一切" }
      - { key: C, text: "工作和生活高度融合，很难也不需要区分" }
      - { key: D, text: "理想中是 C，但目前现实更像 A 或 B" }

  - id: D3-Q05
    dimension: D3_WorkviewLifeview
    theory: Designing Your Life
    type: open_medium
    prompt: "在你一生中，你最不想到了 70 岁回头看时后悔的一件事是什么？"
    min_chars: 60

  - id: D3-Q06
    dimension: D3_WorkviewLifeview
    theory: Designing Your Life
    type: open_medium
    prompt: "你认为'成功'对你来说是什么样的？它和'别人眼中的成功'有多大差距？"
    min_chars: 80

  - id: D4-Q01
    dimension: D4_EnergyMap
    theory: Designing Your Life - Energy Map
    theory_ref: "Burnett & Evans 2016"
    type: open_long
    prompt: |
      回想过去 3 个月内，有哪些具体的活动或经历让你感到"精力充沛、越做越有劲、时间过得飞快"？
      请列举 3–5 个，每个写 1–2 句话说明是什么场景。
    min_chars: 120

  - id: D4-Q02
    dimension: D4_EnergyMap
    theory: Designing Your Life - Energy Map
    type: single_choice
    prompt: "你工作效率最高的时间段是？"
    options:
      - { key: A, text: "早晨（6–10 点）" }
      - { key: B, text: "上午（10–13 点）" }
      - { key: C, text: "下午（13–17 点）" }
      - { key: D, text: "傍晚/晚上（17–22 点）" }
      - { key: E, text: "深夜（22 点以后）" }
      - { key: F, text: "没有明显规律" }

  - id: D4-Q03
    dimension: D4_EnergyMap
    theory: Designing Your Life - Energy Map
    type: single_choice
    prompt: "你更容易进入心流（极度专注）的工作类型是？"
    options:
      - { key: A, text: "创作/写作/设计——从无到有生成内容" }
      - { key: B, text: "分析/推理——在复杂信息里找规律" }
      - { key: C, text: "构建/开发——把想法变成实际运作的系统" }
      - { key: D, text: "沟通/连接——与人建立关系或传递想法" }
      - { key: E, text: "优化/打磨——让已有的东西变得更好" }

  - id: D4-Q04
    dimension: D4_EnergyMap
    theory: Designing Your Life - Energy Map
    type: open_medium
    prompt: "和什么样的人一起工作会让你感到被理解、被激发？反过来，什么样的协作模式会让你特别消耗？"
    min_chars: 80

  - id: D4-Q05
    dimension: D4_EnergyMap
    theory: Designing Your Life - Energy Map
    type: open_medium
    prompt: "想象一个你最近做得很投入、甚至忘了时间的工作场景，当时具体在做什么？是独自还是和人一起？在哪里？"
    min_chars: 80

  - id: D4-Q06
    dimension: D4_EnergyMap
    theory: Designing Your Life - Energy Map
    type: open_long
    prompt: |
      和第一题相对应：过去 3 个月内，有哪些活动或场景让你感到"做完了但更累了、甚至有点厌烦"？
      请列举 3–5 个，每个写 1–2 句话。
    min_chars: 120

  - id: D5-Q01
    dimension: D5_Ikigai
    theory: Ikigai
    theory_ref: "García & Miralles 2016 + Hedgehog Concept"
    type: open_long
    prompt: |
      "你热爱什么？"——请描述 3 件你做起来会忘记时间、不需要被强迫就想去做的事。
      每件事写 2–3 句话：它是什么、在什么情况下会触发、为什么让你着迷。
    min_chars: 150

  - id: D5-Q02
    dimension: D5_Ikigai
    theory: Ikigai
    type: open_medium
    prompt: "在你热爱的这些事里，有没有一件是你从小学或高中就有兴趣的，一直延续到现在？那是什么？"
    min_chars: 60

  - id: D5-Q03
    dimension: D5_Ikigai
    theory: Ikigai
    type: open_long
    prompt: |
      "你擅长什么？"——请描述 3 件你做起来比大多数人更好、几乎不需要刻意思考就能做好的事。
      每件事写 2–3 句话，并举一个具体的例子或结果。
    min_chars: 150

  - id: D5-Q04
    dimension: D5_Ikigai
    theory: Ikigai
    type: open_medium
    prompt: "有没有人主动找你帮忙某件事，是因为他们知道你特别擅长？那是什么？"
    min_chars: 50

  - id: D5-Q05
    dimension: D5_Ikigai
    theory: Ikigai
    type: open_long
    prompt: |
      "世界需要什么？"——在你所在的领域或你关注的社会/行业问题里，你认为最被忽视、最值得有人去做的事是什么？
      请写 2–3 件事，每件事说明你为什么认为它重要，以及现在谁在做、做得怎么样。
    min_chars: 150

  - id: D5-Q06
    dimension: D5_Ikigai
    theory: Ikigai
    type: open_medium
    prompt: "如果你有 5 年不需要考虑收入，你会把时间用来解决什么问题？"
    min_chars: 80

  - id: D5-Q07
    dimension: D5_Ikigai
    theory: Ikigai
    type: open_medium
    prompt: "在你认为自己擅长的事里，哪些是有人愿意付钱的（或者你知道有人在靠它赚钱）？"
    min_chars: 60

  - id: D5-Q08
    dimension: D5_Ikigai
    theory: Ikigai
    type: single_choice
    prompt: "以下哪种方式，你在内心最能接受作为长期的收入模式？"
    options:
      - { key: A, text: "给公司/机构打工，有稳定工资" }
      - { key: B, text: "做顾问/自由职业，卖我的时间和专业" }
      - { key: C, text: "做产品，赚产品带来的收入" }
      - { key: D, text: "靠内容/创作，受众付费或广告" }
      - { key: E, text: "我真的不想考虑收入来源（请说明为什么）" }

  - id: D6-Q01
    dimension: D6_Odyssey
    theory: Designing Your Life - Odyssey Plans
    theory_ref: "Burnett & Evans 2016"
    type: open_long
    prompt: |
      Odyssey Plan A：你目前大概率会走的那条路。
      请描述：如果你继续现在的方向，5 年后你的工作和生活会是什么样子？
      包括：做什么、和谁、在哪、每天的节奏，以及这条路上你最期待什么、最担心什么。
    min_chars: 150

  - id: D6-Q02
    dimension: D6_Odyssey
    theory: Designing Your Life - Odyssey Plans
    type: open_long
    prompt: |
      Odyssey Plan B：如果 Plan A 消失了，你会走哪条路？
      假设你现在所在的行业/公司明天关闭，或者你现在做的事变得不可能了。
      你还能做什么？你会选择做什么？5 年后会是什么样？
    min_chars: 150

  - id: D6-Q03
    dimension: D6_Odyssey
    theory: Designing Your Life - Odyssey Plans
    type: open_long
    prompt: |
      Odyssey Plan C：如果钱和面子都不是问题，你真正想做的事是什么？
      这是一个你可能从来没有认真说出口、因为"不现实"而搁置的方向。
      请描述它，以及：如果你真的去追，会面对的最大障碍是什么？
    min_chars: 150

  - id: D7-Q01
    dimension: D7_Motivation
    theory: Self-Determination Theory
    theory_ref: "Deci & Ryan 2000"
    type: scale_triad_1_5
    prompt: |
      以下三个维度，请分别给目前的生活/工作状态打分（1=极度缺乏，5=非常充足）：
      1. 自主感（Autonomy）：我做事是因为我选择做，而不是被迫的
      2. 胜任感（Competence）：我做的事情让我感到自己有能力
      3. 连接感（Relatedness）：我和身边重要的人或社群有真实的连接
    dimensions: [autonomy, competence, relatedness]

  - id: D7-Q02
    dimension: D7_Motivation
    theory: Self-Determination Theory
    type: single_choice
    prompt: "你认为目前驱动你行动的最主要外部力量是什么？"
    options:
      - { key: A, text: "经济压力/财务安全感", maps_to: financial }
      - { key: B, text: "家人或伴侣的期待", maps_to: family }
      - { key: C, text: "同龄人的比较压力", maps_to: peer }
      - { key: D, text: "职业发展规划的逻辑", maps_to: career }
      - { key: E, text: "我自己真的想要某样东西", maps_to: intrinsic }

  - id: D7-Q03
    dimension: D7_Motivation
    theory: Future-Self Continuity
    theory_ref: "Hershfield 2011"
    type: open_medium
    prompt: "如果 10 年后的你回来看今天，你认为他/她最可能说'我当时为什么没有……'？"
    min_chars: 60

  - id: D7-Q04
    dimension: D7_Motivation
    theory: Regret Minimization
    theory_ref: "Bezos 1994"
    type: open_medium
    prompt: |
      Jeff Bezos 有一个"80 岁后悔最小化框架"：站在 80 岁回头看，你更不愿意后悔：
      A. 我尝试了但失败了
      B. 我从来没有尝试过
      你通常偏向哪边？请给一个最近的例子。
    min_chars: 80
`;

const RUBRICS_MD = `# Rubrics for \`VISION.md\`

> 原则：不能"感觉一下"就下结论。所有核心结论都要么来自结构化计分，要么来自开放题的证据归纳。

---

## 1. 总体流程

1. 按维度整理答案：C / D1 / D2 / D3 / D4 / D5 / D6 / D7
2. 先做结构化计分，再做开放题归纳
3. 对每个维度提取：结论、证据（题号 + 原话摘要）、不确定点
4. 做跨维度矛盾检测
5. 生成 \`VISION.md\`
6. 写 \`confidence\`

---

## 2. D1 价值观（Schwartz）

### 2.1 结构化计分

- D1-Q01 ~ D1-Q05：按选项的 \`maps_to\` + \`score\` 记分
- D1-Q06：排序题第 1 名 +5，第 2 名 +4，第 3 名 +3，第 4 名 +2，第 5 名 +1
- D1-Q08、D1-Q09：选项直接给对应价值标签 +2

### 2.2 开放题补充

对 D1-Q07、D1-Q10 做人工标签归纳，每命中一次可给对应价值 +1 ~ +2：

- Self-Direction：独立、按自己判断、不想活在别人剧本里
- Stimulation：新鲜、挑战、冒险、探索、刺激
- Achievement：卓越、做成、被认可、作品、战绩
- Power：影响力、话语权、掌控资源、主导权
- Security：稳定、确定性、安全感、抗风险
- Conformity/Tradition：守规则、靠谱、家族期待
- Benevolence：照顾身边人、忠诚、责任
- Universalism：公平、公共利益、普世福祉

### 2.3 产出

- Top 5 values + 每个的权重 + 一句解释 + 1-2 个关键证据

### 2.4 矛盾检测

若 Top 2 落在明显对立象限（Self-Direction vs Conformity/Tradition，Stimulation vs Security，Power vs Universalism/Benevolence），必须回扣用户。

---

## 3. D2 性格优势（VIA）

### 3.1 初选

- D2-Q01 选出的 5 项，作为初始 Top 5

### 3.2 行为校正

- D2-Q03 高分（4-5）可提高 Curiosity / Creativity / Judgment 权重
- D2-Q04 高分（4-5）可提高 Perseverance / SelfRegulation 权重
- D2-Q05、D2-Q06 的叙事用于校验

### 3.3 输出

- Top 5 strengths + 其中 1-2 个 signature strengths 的短故事 + 一句"这些优势更适合在哪类环境发挥"

---

## 4. D3 Workview / Lifeview

### 4.1 Coherence Check

结合 D3-Q03 ~ D3-Q06 判断一致性：
- 高一致：工作观与人生观相互支持
- 中一致：大方向一致，但现实路径有明显错位
- 低一致：用户当前主要在为不认同的目标服务

---

## 5. D4 Energy Map

从 D4-Q01、Q06 抽取"高能量活动"和"低能量活动"主题词，用 2 列表格呈现。

强规则：如果用户的 North Star 需要大量依赖其"抽干项"，要在 VISION 的"未解问题"里直接写出来。

---

## 6. D5 Ikigai + Hedgehog

### 交集判定

- 同一主题同时出现在 4 个象限（Love/Good At/World Needs/Paid For）：定义为"四方交集"
- 只出现在 3 个象限：定义为"高潜方向"，缺失项记为 gap
- 只有 2 个象限：只能算兴趣或能力，不得写成主愿景

### Hedgehog 校验

- 我热爱吗？
- 我真的有机会做到世界级/顶级吗？
- 它是否具备长期可持续价值或可交换价值？

---

## 7. D6 Odyssey Plans

对 Plan A / B / C 各做 4 个维度判断（活力感/可行性/一致性/风险），指出最像"默认路线"和最能暴露真实渴望的路线。

---

## 8. D7 动机真实性（SDT）

D7-Q01 三项分别 1-5 分，算均值。

警示：出现以下情况，在 VISION.md 顶部加提醒：
- autonomy <= 2 / competence <= 2 / relatedness <= 2
- D7-Q03 前两位都明显是外部评价驱动

---

## 9. 北极星生成规则

必须满足：
- 足够大（5-10 年）、足够具体（可被验证）
- 与 D1 / D3 / D5 / D7 一致
- 不以单一外部标签定义成功

生成方法：D5 核心交集 → 用 D1/D3 校正"为什么值得做" → 用 D4 校正"能不能长期做" → 用 D7 校正"是不是自己真想要"

好例子：在 2035 年前，做出一款长期被真实用户依赖的工具，并围绕它形成稳定的作品、收入和思想表达。
坏例子：成为更好的自己 / 财务自由 / 做有影响力的人

---

## 10. Confidence 计算

\`\`\`text
confidence = 0.30 * 开放题达标率
           + 0.25 * 矛盾澄清率
           + 0.25 * SDT 均值/5
           + 0.20 * 文档支持充分度
\`\`\`

- >= 0.80：相当稳定
- 0.60 ~ 0.79：可用，但仍有模糊点
- < 0.60：先当工作版本，下次 review 补问

---

## 11. CHANGELOG 规则

每次更新 VISION.md 时，若结论变化明显，追加到 CHANGELOG.md：

\`\`\`markdown
## YYYY-MM-DD vX.Y
- 核心变化：
- 为什么变了：
- 哪些旧结论被保留：
- 下次 review 要重点检查什么：
\`\`\`
`;

const VISION_TEMPLATE_MD = `---
schema: vision/1.0
version: 1.0
status: draft | active | review
owner: <name>
generated_at: <ISO-8601>
city: <optional>
confidence: <0.00-1.00>
next_review: <YYYY-MM-DD>
theories_used:
  - Schwartz Values
  - VIA Character Strengths
  - Designing Your Life
  - Ikigai
  - Self-Determination Theory
  - Hedgehog Concept
  - Future-Self Continuity
notes_sources:
  - <optional document directory>
---

# <Name>'s Life Vision

> 一句话愿景：<one-line-vision>

## 1. Core Values

| 排名 | 价值观 | 权重 | 关键证据 |
|---|---|---:|---|
| 1 | <value> | <0.xx> | <evidence> |
| 2 | <value> | <0.xx> | <evidence> |
| 3 | <value> | <0.xx> | <evidence> |
| 4 | <value> | <0.xx> | <evidence> |
| 5 | <value> | <0.xx> | <evidence> |

### 注记
- 稳定之处：<stable>
- 可能的张力：<tension>

## 2. Character Strengths

- <strength 1>
- <strength 2>
- <strength 3>
- <strength 4>
- <strength 5>

### Signature Strength Story
<一个具体故事，说明这些优势如何在现实里发挥>

## 3. Workview & Lifeview

### Workview
<workview paragraph>

### Lifeview
<lifeview paragraph>

### Coherence Check
- 状态：✅ / ⚠️ / ❌
- 说明：<where aligned or misaligned>

## 4. Energy Map

| 让我活过来的 | 抽干我的 |
|---|---|
| <energizer 1> | <drain 1> |
| <energizer 2> | <drain 2> |
| <energizer 3> | <drain 3> |

### 最适合的环境
<best environment>

### 最该避免的环境
<avoid environment>

## 5. Ikigai / Hedgehog Intersection

### 核心交集
<one-sentence core intersection>

### 备选方向
- <alt direction 1>
- <alt direction 2>

### 当前 Gap
- <gap 1>

### 商业化舒适区
<what kind of monetization feels natural vs wrong>

## 6. Odyssey Plans

### Plan A
<summary>

### Plan B
<summary>

### Plan C
<summary>

### 注记
- 默认路线：<default>
- 最暴露真实渴望的路线：<true desire>

## 7. 10-Year North Star
<10-year north star sentence>

### 判据
- <criterion 1>
- <criterion 2>

## 8. 3-Year Milestones

### Year 1
- <milestone>

### Year 2
- <milestone>

### Year 3
- <milestone>

## 9. Decision Protocol for Other Agents

### 倾向（加分项）
- <prefer 1>
- <prefer 2>

### 避免（减分项）
- <avoid 1>
- <avoid 2>

### 红线（直接拒绝）
- <redline 1>

### 协作风格偏好
- 沟通：<style>
- 建议：<style>

## 10. Current Tensions / Open Questions
- <question 1>
- <question 2>

## 11. Next 90 Days
- <one important experiment>
- <one capability to build>
- <one thing to stop>

## 12. Changelog
- <YYYY-MM-DD v1.0 initial>
`;

const SESSION_TEMPLATE_JSON = JSON.stringify(
  {
    schema: 'vision-session/1.0',
    status: 'not_started',
    createdAt: '<ISO-8601>',
    mode: 'full_interview',
    notesSources: [],
    excludedPaths: [],
    questionOrder: [
      'C-Q01', 'C-Q02',
      'D1-Q01', 'D1-Q02', 'D1-Q03', 'D1-Q04', 'D1-Q05', 'D1-Q06', 'D1-Q07', 'D1-Q08', 'D1-Q09', 'D1-Q10',
      'D2-Q01', 'D2-Q02', 'D2-Q03', 'D2-Q04', 'D2-Q05', 'D2-Q06',
      'D3-Q01', 'D3-Q02', 'D3-Q03', 'D3-Q04', 'D3-Q05', 'D3-Q06',
      'D4-Q01', 'D4-Q02', 'D4-Q03', 'D4-Q04', 'D4-Q05', 'D4-Q06',
      'D5-Q01', 'D5-Q02', 'D5-Q03', 'D5-Q04', 'D5-Q05', 'D5-Q06', 'D5-Q07', 'D5-Q08',
      'D6-Q01', 'D6-Q02', 'D6-Q03',
      'D7-Q01', 'D7-Q02', 'D7-Q03', 'D7-Q04'
    ],
    currentQuestionId: null,
    answers: {},
    followups: [],
    contradictions: [],
    recaps: [],
    generatedArtifacts: [],
    confidence: null
  },
  null,
  2
);
