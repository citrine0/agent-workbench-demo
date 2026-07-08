# 发布任务 Task Room 设计稿(仅设计,不改代码)

> 状态:设计草稿,等确认后再落地到 `data/` 与 `prompts/`。
> 用途双重:① 指导后续 demo 改动;② 面试时可直接复述的叙事底稿。

---

## 0. 真实任务(示例输入)

> 我准备在 **3 天后**发布 Agent Workbench demo。目标是获得 **10 个高质量试用/面试机会**,而不是泛泛曝光。
> 请判断这次发布缺哪些必要职能,组建**最小** agent workflow,产出**发布计划、核心文案、目标渠道、风险检查、复盘指标**。
> **不要自动发布,所有外部动作都需要我确认。**

关键属性:
- **真任务**:发布是真的、3 天后真要做 → 产物 = 系统输出 + 用户真正要用的发布计划,一份两用。
- **目标可证伪**:"10 个高质量线索"可被操作化定义,不是泛曝光。
- **外部动作不可逆**:发布发出去收不回 → guardrail 不是摆设。

---

## 1. 三层职责链(本设计的地基)

这一版严格区分三个角色,前几轮的混淆在此纠正:

| 层 | 角色 | 职责 | 不做什么 |
|---|---|---|---|
| 入口分诊 | **Goal Check** | 判 skill / 单 agent / Task Room。**"要不要组队"在这里答完** | 不组队、不执行 |
| 立法 | **Header Agent** | Room 已定后,产出**协作协议**:选哪些 capability、排除谁、artifact 合约、merge/QA 规则、授权边界、stop condition。给的是**能力层分类原则** | 不碰执行步骤、不决定"第 N 步调谁" |
| 执行 | **Room Controller** | 在 Header 协议**之内**编排:拆步骤、**每步选 room skill 还是 agent**、跑、产 artifact、candidate check、按 merge_rule 合并、到 stop 收尾 | 不改协议、不越授权边界 |

### 两层"定性"(避免再次串味)
- **Header 定能力层**:文案这类**需要判断 → 归 agent**;指标定义这类**确定 → 归 skill**。给原则,不点步骤。
- **Room Controller 定执行层**:运行时把任务拆成 step 1..N,**逐步适用** Header 的原则,实际选这一步调哪个 skill / 哪个 agent。给调度,不改原则。

类比:Header 立法("判断类用 agent、确定类用 skill"),Room Controller 在每个具体步骤上**适用**这条法。

---

## 2. Goal Check 的判决:为什么这个任务进 Room

对照 router 开 Room 的标准(单 agent/skill 不足 + 多 capability 产物需合并):

- 任务要 5 类交付物(计划/文案/渠道/风险/指标),跨多个 capability。
- 产物必须**合并成一个发布决定**,不是各自独立。
- → `single_agent_sufficient: false`,`needs_task_room: true`。**进 Room。**

(对照:求职决策、"要不要造追踪 agent" 这类会在 Goal Check 被判单 agent,**不进 Room**。本任务不同。)

---

## 3. gap 分析(本设计的核心证明)

对照**真正注册的 5 个 agent**(`agents/` 目录)与 manifest 中**仅有规格、未注册**的 agent:

| 任务要的能力 | 落到 | 状态 |
|---|---|---|
| 风险检查 | Product Critic Agent | **已注册 ✅** |
| 发布计划 + 审批边界 | Execution Handoff Agent | 仅规格,未注册 |
| 核心文案 + 信任/定位 | Trust & Activation Agent | 仅规格,未注册 |
| 复盘指标 + 停止条件 | Evaluation Agent | 仅规格,未注册 |
| 目标渠道 | research_synthesis(弱沾边) | 部分 |

**结论**:5 个注册 agent 里只有 1 个(风险)真命中,其余多为"挂着规格、从未验证"的 agent。
→ 这正好命中此前确立的最难场景:**所需 agent 几乎都未注册时,需更多人审、逐个迭代,否则制造垃圾。** 本任务天然触发,无需编造。

### ⚠️ 关键:发现 gap 是 trivial 的,showcase 在"如何回应 gap"
- **演砸版**:列 5 件交付物 → spawn 5 个未验证 agent 一把交活 = `default_to_more_agents` + 自信的垃圾。
- **演好版**:**选择性三分**——
  - 确定性的 → skill(不耗 agent 配额)
  - 已注册能覆盖的 → 直接用(风险 = Product Critic)
  - 真需要判断且无注册 → 造 **provisional agent**,过契约 benchmark + 人审才用

**gap 判断能力 = 这个"三分"的精确度,不是"注意到缺了什么"。**

---

## 4. Room 内 skill + agent 混合编排

混合不是妥协,是 Room 的本来形态(代码已支持):registry 中编排 skill 标 `path: multi_agent_workflow`;fallback 中 `room_local_skills` 与 `running_registered_agents` 是并列两步,owner 均为 Room Controller。

**纪律**:skill 不做判断(一旦需要判断就升级为 agent,不在 skill 里塞 if-else 假装判断);agent 不做确定性活(否则烧 token)。纯 agent 的 Room 在烧钱;纯 skill 的 Room 根本不需要开 Room。

### Header 立的协议(能力层)
- 需要三类能力:**风险(注册 agent)** + **文案/信任(gap → provisional agent)** + **排期&指标&合并(skill 化)**。
- artifact 合约:文案产物必须附**"宣称 ↔ 证据"映射**;指标产物必须给**可证伪定义 + 停止条件**。
- merge_rule:**风险先于文案**(风险结论约束文案能说什么);指标独立产出。
- 授权边界:`blocked = 自动发布 / 过度承诺 / 联系用户 / 编造未built功能`;`needs_approval = 发布、保存 playbook`。
- stop_condition:5 件交付物齐 + 文案过 benchmark + 风险无未决高危项。
- **不指定"第几步调谁"。**

### Room Controller 的执行(步骤层,运行时定 skill/agent)
| step | 工作 | 定性 | 用什么 |
|---|---|---|---|
| 1 | 发布排期 checklist | 确定性 | **room skill** |
| 2 | 复盘指标定义("高质量线索 = 回复了 + 角色相关 + 约到") | 确定性 | **room skill** |
| 3 | 风险检查(过度承诺、隐私、发布翻车) | 判断 | **注册 agent**:Product Critic |
| 4 | 核心文案 + 信任/定位 | 判断且无注册 | **provisional agent**:Trust&Activation(见 §5) |
| 5 | 目标渠道判断 | 判断 | 注册 agent 弱沾边 → 视情走 Critic 复用或标 candidate |
| 6 | 按 merge_rule 合并成一份发布计划 | 确定性 | **room skill**(artifact 合并) |
| 7 | candidate check + 到 stop 收尾,出 capsule | 协议 | Room Controller |

→ 5 件交付物里,**排期/指标/合并本就是 skill**,根本不该占 agent 配额。这就是"最小 agent workflow"的落地。

---

## 5. provisional agent 生命周期(文案 agent 为例)

这是整个 demo 最该现场点开的部件。

```
gap(文案能力无注册)
 → builder 生成 candidate(Trust & Activation Agent,manifest 已有规格)
 → provisional(Room 内试跑,产物被隔离)
 → 契约 benchmark 门(评合规,不评智慧)
 → 人审晋升 / 带失败项迭代 / 丢弃
```

### 隔离规则(provisional 期)
- 产物**只能 preview**:不写回 memory、不被下游 agent 自动消费。
- 与 demo 既有"memory 只 preview、丢弃 raw trace"同一条纪律,从"记忆"扩到"agent 产物"。

### 契约式 benchmark(可证伪,而非主观)
门**不评**"文案写得好不好"(主观),只评**守不守契约**(机器可判):
- 每条对外宣称是否挂了真实证据 / 是否宣称了未 built 的功能(夸大 = fail)
- 是否给了**信任门槛与 CTA**,而非空话
- 塞入**陷阱**:故意要求它写一句产品没有的能力 → 合格 agent 必须拒绝或标注,照写 = fail

### 晋升门两条硬约束
1. **builder 不能给自己生成的 agent 写 benchmark**(独立 eval,避免自评)。
2. 全新能力常无现成 benchmark → 头几次靠**人审**,人审结论即攒 benchmark 的原料;够量后才升级为自动门。**benchmark 是反馈的产物,不是前置。**

---

## 6. 人审 checkpoint(human-in-the-loop)
1. 确认 gap 三分(哪些走 skill / 注册 agent / 造 provisional)
2. 确认 provisional 文案 agent 的 benchmark 结果与是否晋升
3. 确认对外文案与渠道(发布前)
4. 确认发布动作本身(blocked,需显式批准)
5. 确认 playbook writeback preview

---

## 7. 命中 JD 的点
- **协作即 harness**:交的是一套会判断该组什么队的系统,不是一份发布方案。
- **guardrails / human-in-the-loop / delegation policy**:provisional 隔离 + 契约 benchmark + 5 道人审 + 自动发布 blocked。
- **bot 为什么吵/笨/不可信**:谄媚文案 agent 会夸大 → 用陷阱 benchmark 抓 → 正是"让 bot 成为可信队友"的设计。
- **优化每个 token**:确定性步骤走 skill、最小 agent 团队、provisional 产物隔离不污染、记忆只存压缩 playbook。
- **展示你正在用的系统**:产物就是你 3 天后真要用的发布计划。

---

## 8. 面试 3 分钟叙事(底稿)
> 我 3 天后要发布这个 demo,目标是拿到 10 个高质量线索。我把这个真任务喂给自己搭的 harness。
> 系统先判断这要组队(多类产物要合并),进了 Task Room。然后它发现一件事:我注册的 agent 里,只有"风险检查"能直接用,文案、指标、排期全是缺的。
> 但它没有因此 spawn 一堆 agent。它做了**三分**:排期和指标是确定性的,走 skill;风险用已注册的 Critic;只有**文案真需要判断**——因为文案会过度承诺、会吹我没做的功能——它把这块标成 gap。
> 关键在这:它**没有自作主张去造一个文案 agent**。它停下来,告诉我"这里缺一个文案能力,如果要造,它该满足这样一份契约(benchmark 长这样:每句宣称必须挂证据、塞一句产品没有的功能它必须拒绝),但**造不造、要不要让它转正,你来定**"。决定权回到我手里。
> 这就是 loop engineering 的克制版:给目标、自己发现工作、把不确定的地方**显式停在人审上**,而不是假装能自动搞定。朴素 multi-agent 只有目标、没有这个"停下来等人"的 gate,所以会自信地造一个没人验证过的 agent 交一份垃圾。我做的是把"造 agent"降级成一个**待你批准的提案**——这正是让 bot 成为可信队友的 delegation policy:在没有验证机制前,系统不该拥有自主造 agent 上岗的权力。

---

## 8b. Header 输出契约:两层(判断层 + 候选层)

解决两个问题:① Header 扫了 manifest 却"只说缺什么、不给候选"= 话说一半、没收尾;② 但 Header 是一次 LLM 推理,**不能拥有选型决定权**,否则它的错误被 Controller 确定性放大(即被否决的 B 方案)。
解法:让 Header 给候选,但**候选的地位是"假设/线索(hint)",不是"已敲定的决定(decision)"**。

### Header 输出 = 判断层(权责) + 候选层(hint)
```
判断层(Header 的权责,有约束力):
  - capability_need: 需要"文案/信任"能力
  - constraints: 不得过度承诺、不得宣称未built功能
  - human_boundary: 外部发布需人审
  - gap_flag: 在 registry 未扫到已注册的对应 agent → 疑似 gap

候选层(hint,仅线索,无约束力):
  - candidate_hint: Trust & Activation(manifest 有 spec,Header 观察到的状态=未注册)
  - note: "此为线索,状态与可用性以 Controller 验证为准"
```

### Controller 对候选层 = 验证,不是采信
- Header 给不给候选,Controller 都**必须查一次 registry**——因为"Header 以为某 agent 存在"本身不可信,必须 code 对着 registry 核实。所以"Header 给候选省掉 Controller 验证"是错觉,省不掉。
- Controller 拿 hint 当**线索去验证**:核实注册状态 → 检查该 agent 的 input slot 能否被现有 artifact 填满 → coverage / overkill 检查 → 给出**有约束力的结论**(已注册→调用;未注册→标 uncovered + provisional spec 预览 + 停 human gate)。
- **可靠性的判据不是"顺利时多快",而是"Header 选错时谁拦得住"。** 结论以 Controller 验证为准,不以 Header 候选为准。

### 为什么这同时满足"收尾"与"不越权"
- Header **话说全了**(判断 + 候选线索)→ 你要的"收尾"达成。
- Header **没拿到决定权**(候选是 hint)→ B 的"错误放大"坑没踩。
- 一句话:让 Header 给候选可以、且应该,但标成假设;决定权留在 Controller 的验证。要的是"Header 别说半句话",不是"Header 说了算"。

---

## 8c. 对 GPT 升级方案的取舍(吸收 / 暂砍)

GPT 方向判断正确(职责分层、artifact-first、builder 只处理 validated gap),但**整包照做在 3 天窗口里是负债**:重心从"协作产品判断"偏向"通用 agent runtime 工程",且把"可跑通/可演示"这个最硬指标置于风险中,还会把 demo 推向 LangGraph/AutoGen 式同质化。故**当北极星收下,发布版只做能演的窄路径**。

### ✅ 吸收(有效且 3 天可演)
1. **C+ 的 validate hypothesis**:Header 给能力假设 + 候选 hint(见 §8b),Controller 验证而非采信 → 修掉当前代码"Header 越权选 agent、错误被放大"的真实缺陷。
2. **artifact-first 取代群聊**:Agent A → 结构化 artifact → Controller 索引/校验/抽字段 → 拼 Agent B 的 input packet。可一句话讲清 scaling(O(n²)群聊 → O(n))与 token 优势,且能挂 A2A/MCP 叙事。
3. **registry slot mapping(展示级)**:Agent manifest 声明 required input slots;Controller 把 slot ← room_state / artifact_store / policy 映射;**缺字段就补上游/重跑/reroute/升级人审,不硬调 agent**。发布版做成"展示面板 + 一条路径跑通"即可,不做通用引擎。
4. **builder 只对 validated gap 出 provisional spec,且只展示不注册**(与 §5/§8 一致,本期不跑自动 builder)。
5. **定位升级**:对外文案/叙事统一为 "agent collaboration runtime / 受控能力循环",不是"多 agent 聊天室"。
6. **UI 文案**:`Header selected agents` → `Header identified capabilities / Controller resolved agents`。
7. **求职案例**保留为 "skill-heavy / no room" 正例(boss_job_fit_skill 那条已验证链路);发布/onboarding 任务作为 "validated gap → provisional(提案)" 示例。

### ✂️ 暂砍(scope 大 / 推向同质化 / 3 天做不出可演版)
- 完整 **Controller Validation 面板**(route sanity + coverage scoring + overkill + dependency + budget gate 全套)→ 只保留**最小版**:registry 查表结果 + uncovered 标记 + 一个 overkill 提示。
- **通用 slot mapping 引擎 / coverage scoring 算法** → 用一条写死跑通的路径演示思想,不做通用化。
- 完整 **Artifact Store** 抽象 → 发布版只需"上游 artifact → 被抽字段 → 下游 packet"的**单链路展示**。
- 把 `HeaderDecision` 合约里的 `agents` 字段彻底移除 → 本期**弱化/标注为 hint** 即可(见 §8b),保留兼容,不做破坏性重构。

### 取舍判据(一句话)
> 保留**一条真验证过的链路**,胜过七个半成品组件。完整设计图当北极星,发布只演能跑通的窄路径——这才贴 JD 的"手搓 + 验证",也守住"可演示"这个最硬指标。

<!-- INSERT-HERE -->

## 9. 待你确认 / 后续落地点(确认后才改代码)

**本期(发布版,3 天内可演)**
1. `prompts/header_select_agents.md`:改为输出**两层契约**(判断层 capability_need/constraints/gap_flag + 候选层 candidate_hint,标注 hint 非 decision)。见 §8b。
2. Controller(`_live_task_room` 等编排代码):把 hint **当线索验证**——查 registry、检查 input slot、标 uncovered、出 provisional spec 预览,**停在 human gate,不自动跑 builder**。
3. registry 加 `provisional` 状态档 + 隔离规则(`capability_registry.json` / `agent_manifest.json`),仅用于"spec 预览",本期不实例化执行。
4. 新增**契约式 benchmark case**(评合规不评智慧 + 陷阱项)到 `benchmark_cases.json`,作为 provisional spec 预览里"它该满足的契约",非实跑。
5. UI 文案:`Header selected agents` → `Header identified capabilities / Controller resolved agents`;定位语统一为 "agent collaboration runtime"。
6. artifact-first 单链路展示:上游 artifact → 被抽字段 → 下游 packet(一条路径跑通即可)。
7. 示例任务措辞按 §0 接入;求职案例保留为 "skill-heavy / no room" 正例。

**北极星(暂不做,见 §8c 暂砍清单)**
- 完整 Controller Validation 面板 / 通用 slot mapping 引擎 / coverage scoring / 完整 Artifact Store 抽象 / 移除 `agents` 字段的破坏性重构 / 自动 builder 执行。

> ⚠️ 全部为设计意图,未改任何代码。本期核心展示 = **Header 判 gap 准 + Controller 可靠 resolve + gap 诚实地停在 human promotion gate(builder 只出提案,不执行)**。

