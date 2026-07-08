# 协作产品与 Agent 进入点研究 v1

日期: 2026-06-24

任务简述: 研究 Linear / Slack / 飞书(Lark) / Multica / Paperclip / OpenAI Symphony 的产品定位、协作机制、优点局限，并判断 Agent 应该如何进入真实协作工作流。

本文是 `agent-workbench-demo` 的参考 artifact。结构上刻意保留产品卡、对比矩阵、介入点、guardrails 和机会判断，方便后续 Task Room 拆成 research cards、critique passes、conflict logs 和 opportunity judgment。

## 0. 信息可信度

| 产品 | 可信度 | 证据状态 |
| --- | --- | --- |
| Linear | 高 | 官方产品页和文档清楚描述了 product development workflow、issues、projects、initiatives、Asks 和 Agents。 |
| Slack | 高 | 官方页面清楚描述了 channels、threads、canvas、lists、workflow automation、Slackbot、Agentforce、apps 和治理能力。 |
| 飞书 / Lark | 高 | 官方页面清楚描述了以 Messenger 为入口的一体化办公套件，以及 Docs、Base、Approval、Wiki、Calendar、Meetings、Open Platform 等对象。 |
| Multica | 高 | 官网和 GitHub 将其定位为面向 human + coding agent team 的 project management 平台，强调 issue/task、runtime、agents、skills、usage、squads 等对象。 |
| Paperclip | 高 | GitHub 项目 `paperclipai/paperclip` 将其定位为管理 AI agents at work 的开源 control plane，强调 company、goals、org chart、tickets、budgets、heartbeats、governance 和 audit。 |
| OpenAI Symphony | 高 | OpenAI 官方文章和 `openai/symphony` repo 将其定位为开源 Codex orchestration spec / reference implementation: 把 Linear 这类 issue tracker 变成 coding agents 的 control plane。 |

## 1. 执行摘要

这份研究的结论不是“再做一个 Slack / 飞书聊天工具”，也不是“再做一个 Linear issue tracker”。更清晰的机会是:

> Agent Workbench 不替代团队协作产品，而是补一层 human-agent collaboration workbench: 当 agent 成为主要执行者时，人需要一个设目标、看证据、给反馈、做授权、迭代能力的界面。

关键判断:

- Slack / 飞书解决的是 human-human collaboration: 多人沟通、共享上下文、组织同步、开放讨论。
- Linear 解决的是 structured work execution ledger: 产品工程团队如何围绕 issue / project / initiative 推进工作。
- Multica 解决的是 coding-agent issue execution ledger: coding agents 如何像工程同事一样接 issue、更新状态、产出代码或工作结果。
- Paperclip 解决的是 agent organization control plane: 持久 agent 团队、公司目标、组织结构、预算、心跳和治理。
- OpenAI Symphony 证明了 coding agent 协作不一定发生在聊天里，而可以由 issue tracker / project board 驱动: 每个任务映射到隔离 workspace，agent 持续执行，人 review proof-of-work 和最终结果。
- Agent Workbench 的更合理定位是: 一人公司如何安全、高效地委托 agent team，看到 result / evidence / uncertainty，并把人的反馈转成 task patch。

这意味着 demo 不应把别的产品的长处当成自己的短处来比较。Slack / 飞书的优势是多人自由讨论，Linear 的优势是工程执行账本，Multica 的优势是 coding agent task lifecycle，Paperclip 的优势是持久 agent company。Agent Workbench 的价值在另一层: human-agent 协作界面。

## 2. 产品类型边界

| 类型 | 代表产品 | 核心对象 | 协作对象 | 主要价值 |
| --- | --- | --- | --- | --- |
| 团队沟通层 | Slack / 飞书 | channel、thread、chat、doc、approval、Base | 人和人 | 共享上下文、跨职能沟通、开放讨论、组织同步。 |
| 工程执行账本 | Linear | issue、project、initiative、cycle、status | 人和结构化工作 | 把产品工程工作拆成可追踪、可分配、可回溯的对象。 |
| Coding agent 执行账本 | Multica | issue、task、runtime、agent、squad、skill | 人和 coding agents | 让 coding agents 接任务、报告进度、执行代码工作并保留状态。 |
| Agent 组织控制面 | Paperclip | company、goal、org chart、ticket、budget、heartbeat | agent 和 agent 组织 | 运行持久 agent 团队，管理预算、权限、治理和审计。 |
| Coding agent 编排 harness | OpenAI Symphony | Linear issue、isolated workspace、agent run、PR、CI、proof-of-work | 人和 coding agents | 把 issue tracker 变成 Codex / coding agents 的运行控制面，让人管理 work 而不是盯 session。 |
| Human-agent workbench | Agent Workbench | mission、result surface、artifact、approval、patch、provisional capability | 一个人和 agent team | 让人通过结果、证据、不确定性、反馈 patch 和授权边界管理 agent 执行。 |

这个边界适合加入本文，因为它能避免一个错误叙事: Agent Workbench 不是要取代 Slack / Linear / 飞书，而是探索另一类问题:

> 当 agent 是主要执行者时，人应该通过什么界面和 agent 高效协作？

## 3. 产品卡片

### Linear

**定位**

Linear 是面向现代产品开发的系统，围绕 product direction、issues、projects、initiatives、releases、customer requests、insights 和 software delivery 组织工作。

**协作机制**

- 工作被组织成结构化对象: issues、projects、initiatives、documents、customer requests、comments、status、ownership 和 dependencies。
- 产品规划和执行被连接起来: specs、docs、issues、feedback、updates、milestones 和 dependencies 在同一系统中形成执行链路。
- Asks 可以把 Slack、email、form 等入口的请求转成 Linear-managed issues，并把进度同步回原通道。
- Agents 被建模为 workspace members: 可以被分配 issue、在 comment 中被 mention、加入 project，并由人监控。
- 责任仍然以人为中心: issue delegated to an agent 时，人类 assignee 仍负责最终完成，agent 是 contributor。

**优点**

- 强结构让 delegation 可度量、可审计。
- ownership、status transitions 和 issue history 让 agent 可执行范围更清晰。
- 对 product / engineering 任务很适配，因为软件工作天然可以映射成 issue、dependency、PR、release。
- 提供了一个重要模式: agent 不是后台黑箱，而是有状态、有责任边界的 contributor。

**局限**

- 最适合能转成 issue / project 的工作。
- 对早期模糊对话、stakeholder alignment、跨组织谈判不如 chat / doc 自然。
- agent 协作受 Linear 对象语义约束，宽泛探索型研究仍可能需要独立 workspace 或 room。

**Agent 介入点**

- 把模糊请求转成 issue / project brief。
- 检测 duplicate、missing requirements、dependencies、blockers 和 risk。
- 根据 issue type 推荐或分配 specialized agent。
- 生成 implementation plan、PR prompt、QA plan、release note 和 status update。
- 在 scope change、priority change、external communication 和 final acceptance 时保留 human-in-the-loop。

**对 demo 的启发**

Linear 最强的启发是“agent as accountable contributor inside structured work”。Agent Workbench 可以借鉴它的 accountability model: agent 输出必须挂到 mission、role、scope、artifact 和 owner，而不是漂浮在聊天里。

### Slack

**定位**

Slack 是团队协作操作系统，核心是 channels、messaging、threads、huddles、canvas、lists、apps、workflow automation、enterprise search、Slackbot、Agentforce 和 agentic platform。

**协作机制**  为了让非代码用户加入 采用应用集成 （可以接入其他的应用）以及 无代码工作流 （触发器，action 嵌入ai 流程）  只是沉淀 画布，在 thread 侧边提供内容总结 2024年之后，在飞书与notion 火热的时候，认识到让用户在聊天软件中管理任务，于是添加了 canvas 文本块，可以添加 channel 内容，外部信息  与 list （结构化任务看板）

传统的 ai 接入模式，人沟通确定任务，@ agent执行 获取全部上下文，得到结果，返回channel 共享
新的ai 接入模式，event 触发，监测对话，对话中事件触发 目前陷于特定敏感词与特定事件，会触发流程
 
- Channels 围绕团队、项目、主题和外部伙伴组织实时对话。 Channel 是主干类似于微信群，thread 是分支 特定信息的讨论区
- Canvas、Lists、files、clips 和 huddles 把消息层扩展成轻量文档、任务、异步更新和会议。 
- Apps、Workflow Builder、Slack Marketplace、search 和 MCP 能力让 Slack 成为工具和 agent 的入口。
- Slackbot / Agentforce 指向的方向是: agent 能从团队上下文中回答、路由请求、更新系统并跨工具行动。

**优点**

- 进入成本低，人本来就在 Slack 里讨论工作。
- 上下文密度高，很多决策、争议、文件和状态先出现在 channel 或 thread 中。
- 集成生态成熟，天然适合作为 agent front door。
- 适合 human-in-the-loop: approval 和 clarifying question 可以发生在同一个 thread。

**局限**

- 消息流噪音高、不完整、社会语境复杂。
- bot 发言过多、总结不准或越权行动时，会变得烦人且不可信。
- thread context 可能分散在 channel、DM、canvas 和外部工具中。
- 如果 agent action 没有绑定 owner、task 和 system of record，accountability 会弱。

**Agent 介入点**

- 总结长 thread，生成 decision record。
- 把消息转成 task、Linear issue、ticket 或 research brief。
- 把请求路由给合适的 expert agent 或 tool。
- 在写动作前问澄清问题。
- 在明确授权和审计下运行 workflow automation。
- 检测讨论何时变成 decision、conflict、blocker 或 follow-up task。

**对 demo 的启发**

Slack 证明了 agent front door 的价值，也暴露了 message-native agent 的风险: 噪音、打扰和弱责任边界。Agent Workbench 不应复刻 Slack 群聊，而应把 Header Agent 设计成 boundary manager: 决定什么时候保持沉默、什么时候询问、什么时候开 room、什么时候返回压缩结果。
 
### 飞书 / Lark

**定位**

飞书 / Lark 是一体化协作套件，组合了 Messenger、Docs、Base、Meetings、Minutes、Calendar、Email、Approval、Wiki、OKR 和 Open Platform。它以消息为入口，但把工作动作连接到 suite-native objects。

飞书 群聊形式  对话群类似于微信群 但是吸收了slack的优点，内部有thread模式 话题群 类似于根据具体问题而生的讨论楼，优势在于不感兴趣不会被影响。 日历驱动协同 okr objection and key results kpi Key Performance Indicators  

飞书对于 技术员工 采用 飞书project 类似linear
飞书的多维模版 借鉴的是Airtable（多维表格鼻祖），四种基础视图（表格、看板、甘特、画册）
**协作机制** 

- Messenger 把团队、工具和上下文连接在一个 chat feed 中。
- Chat 可以连接邮件分享、日程、任务、审批等动作。
- Threads 和 chat tabs 降低 group feed flooding，并帮助保留上下文。
- Docs、Base、Wiki、Approval、Meetings、Minutes、Calendar 和 Open Platform 形成 suite-level work graph。
- Base 是非常强的 agent-entry object: records、fields、views、workflows 和 automations 可以把模糊协作转成结构化运营。

**优点**

- 跨对象 workflow 强: chat、doc、table、approval、calendar 和 meeting notes 可以互相连接。
- 相比纯 chat，更适合 operational workflow，因为审批和数据表是一等对象。
- 适合想减少工具碎片的一体化组织。
- 翻译、会议、文档和开放平台增强了跨地区协作。

**局限**

- 套件广度会带来复杂性，用户可能不知道 source of truth 在哪里。
- agent permission 更难，因为一个动作可能触达 chat、docs、tables、approvals 和 external APIs。
- 强 suite lock-in 可能降低跨工具 agent portability。
- 对 agent 协作来说，挑战不仅是能力，还包括跨对象写入治理。

**Agent 介入点**

- 把会议和 chat 结果转成 Docs、Base records、tasks、approval 和 calendar follow-up。
- 监控 Base records 的缺字段、停滞审批和 SLA 风险。
- 从 chat decisions 草拟或更新 docs。
- 准备 approval packet，并让人最终确认。
- 通过 Open Platform API 执行受控写动作。

**对 demo 的启发**

飞书证明的是 integrated collaboration graph。Agent Workbench 可以借鉴跨对象思路，但不要做完整办公套件。更锋利的机会是让 Task Room / Agent Room 输出能映射到多种 destination objects: doc、task、decision、approval、issue 或 playbook。

### Multica

**定位**

Multica 是开源的 human + agent project management 平台，公开叙事更偏 coding agents: 让 coding agents 成为真正队友，能被分配任务、追踪进度、沉淀技能，并和人类工程团队在同一工作台中协作。

**协作机制**

- 以 issue / task 为工作入口，agent 可以接收任务、更新状态、报告 blocker 和产出工作结果。
- 支持多种 coding agent / runtime，例如 Claude Code、Codex、Gemini CLI、Cursor、OpenCode 等。
- 平台对象包括 agents、runtimes、skills、squads、usage、issues 等。
- 它关注的是 coding agent 的 task lifecycle: assign、run、monitor、review、reuse。

**优点**

- issue 是 coding agent 很自然的任务单位，和工程团队的现有工作方式匹配。
- 比普通聊天更适合管理 long-running agent work，因为任务、状态、owner、runtime 和 usage 都可见。
- 支持 bring-your-own coding agent，有利于连接已有 CLI / IDE agent 生态。
- 把 coding agents 变成可管理的 workforce，而不是散落在终端里的临时会话。

**局限**

- 当前产品 wedge 明显是 coding-agent project management，不是泛业务协作工具。
- 底层 agent 可以做非编码任务，但产品语义主要围绕 coding execution、issue、runtime 和 PR-like workflow。
- 对一人公司“该不该构建某个 agent / 是否值得补能力”的前置判断，不是它的主叙事。

**Agent 介入点**

- 从 issue 获取任务上下文并执行 coding work。
- 报告 blocker、更新状态、生成 patch / PR / review notes。
- 根据技能和 runtime 分配合适的 coding agent。
- 复用稳定技能，减少重复 prompt 和重复配置。
- 记录 usage、run time、tokens 和失败模式。

**对 demo 的启发**

Multica 证明 coding agents 可以进入 issue-based workflow，成为被管理的 worker。Agent Workbench 不应和它比“谁更会让 agent 写代码”，而应回答更前置的问题:

> 面对一个目标，系统如何判断它是否应该变成 agent work，以及需要 skill、single agent、task room、还是 provisional capability？

### Paperclip

**定位**

Paperclip 是管理 AI agents at work 的开源 app / control plane。它的核心隐喻是“company, not chat”: 如果 coding agent 是员工，Paperclip 是围绕它们的组织。它不是单纯 agent framework 或 prompt manager，而是通过 company goals、org charts、tickets、budgets、governance、runtime workspaces、heartbeats 和 audit trails 管理 agent teams。

**协作机制**

- 用户定义 company 或 business goal，然后围绕目标创建 agent organization。
- Agents 可以有 roles、titles、reporting lines、permissions、API keys 和 budgets。
- 工作通过 issues / tickets 追踪，包含 project、goal、parent links、dependencies、comments、documents、attachments、work products、labels、inbox state 和 execution locks。
- Heartbeats 唤醒 agent，让 recurring 或 long-running work 不需要人工 babysitting。
- Governance 覆盖 hiring / approvals、strategy overrides、budget limits、pause / resume / terminate controls、decision tracking 和 audit logs。
- Paperclip 是 bring-your-own-agent: Claude Code、Codex、Cursor、OpenClaw、CLI agents、HTTP bots 和 plugins 可以接入，只要能接收任务并报告 heartbeat / state。

**优点**

- 是 Agent Workbench Task Room 思路最直接的参照之一，因为它把 agent work 建模成 organization，而不是 conversation。
- long-running agent work 可以通过 tickets、traces、activity、cost events 和 work products 检查。
- budget control、governance 和 audit 是核心 primitive，不是后补功能。
- 支持多种 agent runtime，而不绑定单一模型或实现。
- company / template 概念对 reusable room / team pattern 有参考价值。

**局限**

- 更像 agent-organization operating system，而不是 human-facing collaboration workspace。对小型一次性任务可能偏重。
- company 隐喻可能过度结构化 exploratory work。
- 它更偏 persistent teams / autonomous business，而 Agent Workbench 当前更适合 human-facing mission room 和 Header Agent boundary。
- README 证明了强产品意图，但可靠性还取决于 adapter behavior、task completion quality、evals 和真实用户工作流。

**Agent 介入点**

- 把 business goal 转成 company / project / issue hierarchy。
- 为任务提出最小 agent org chart。
- 按 role、permission、runtime、budget 和 availability 分配 agent。
- 通过 heartbeat 维持 recurring work。
- 暴露 blocker、budget exhaustion、stale task、duplicated work 和 unresolved dependencies。
- 保存 work products、cost events、tool traces 和 decision history。

**对 demo 的启发**

Paperclip 证明 multi-agent collaboration 可以成为产品界面，而不只是 backend orchestration pattern。Agent Workbench 应该清楚区分:

- Paperclip: persistent agent company、org charts、budgets、heartbeats、tickets、governance。
- Agent Workbench: human-facing Header Agent + temporary mission room，围绕具体目标暴露 capability gap、artifact、uncertainty、approval 和 patch。

因此 demo 不应复制完整 company OS，而应借鉴它的 primitive: tickets / artifacts、roles、budgets、audit、governance、bring-your-own-agent adapters。

### OpenAI Symphony

**定位**

OpenAI Symphony 是 OpenAI 推出的开源 Codex orchestration spec / reference implementation。它的目标不是做一个新的聊天协作产品，而是把 Linear 这类 issue tracker 变成 coding agents 的 control plane: 人在 issue / project board 中管理 work，Symphony 为每个任务启动隔离 agent workspace，让 Codex 等 coding agents 执行、提交、回报状态。

**协作机制**

- Linear issue / project 是任务入口和状态机。
- Symphony 监控 board，根据 issue 状态启动或推进 agent work。
- 每个 agent run 使用隔离 workspace，降低不同任务之间的上下文污染和环境污染。
- Agent 的中间状态、proof-of-work、PR、CI/test 结果和最终状态会回写到 issue。
- 人类不需要盯单个 Codex session，而是在 issue tracker 中 review 结果、处理 blocker、决定 merge / close / rerun。
- OpenAI 将其描述为 orchestration spec，因此重点是可复用的协作协议，而不是单一 UI。

**优点**

- 直接验证了一个重要方向: agent collaboration 的核心界面可以是任务系统，而不是群聊。
- Linear issue 给 coding agent 提供了天然的 scope、status、owner、acceptance criteria 和 audit trail。
- isolated workspace 让并行 agent work 更安全、更可回溯。
- proof-of-work / PR / CI 把 agent 输出落到工程团队已经认可的 review primitive 上。
- 它让人从“监督 agent session”升级为“管理任务结果和异常”，和 Agent Workbench 的人审界面思路一致。

**局限**

- 明确偏 coding agent orchestration，最适合能落到 repository、branch、PR、test 和 CI 的工作。
- 依赖 issue quality: 如果 Linear issue 没有清晰目标、验收标准和上下文，agent run 仍然可能偏航。
- 它更像工程执行 harness，不直接解决“这个任务该不该开 room / 该不该补一个新 agent 能力”的前置判断。
- 对非代码工作、跨职能判断、产品策略和能力 onboarding 的覆盖有限。

**Agent 介入点**

- 从 Linear issue 读取任务上下文、目标和验收标准。
- 为 issue 创建隔离 workspace，并启动 Codex / coding agent。
- 更新 issue 状态、报告 blocker、附上 proof-of-work。
- 生成 patch / PR，并等待人类 review。
- 根据 CI/test 结果决定是否继续修复、请求帮助或升级给人。

**对 demo 的启发**

OpenAI Symphony 证明了一个和 Slack 群聊不同的 agent 协作路径: issue tracker / workbench 成为 agent runtime 的控制面。Agent Workbench 可以吸收这个判断，但不要把自己收窄成 coding orchestrator。更锋利的差异是:

- Symphony: 已有 Linear issue -> coding agent workspace -> PR / CI / proof-of-work。
- Agent Workbench: 用户目标 -> Header 判断 route / capability gap -> Controller 组合已有能力或触发 provisional capability -> result surface 展示 evidence / unknowns / approval points。

因此，Symphony 是 Agent Workbench 的强参照，不是直接竞品。它支持“人不该盯 agent session，而该管理任务、证据和审核点”的叙事；Agent Workbench 需要补上更前置的能力判断和非代码任务协作。

## 4. 对比矩阵

| 产品 | 主要对象 | 协作风格 | Agent 成熟模式 | 对 demo 的最大启发 |
| --- | --- | --- | --- | --- |
| Linear | Issue / project / initiative | 结构化产品工程执行 | Agent as assignable contributor | delegation 需要 ownership、state、artifact 和 accountability。 |
| Slack | Channel / thread / canvas | 消息原生协作 | Agent as front door / assistant / automation endpoint | agent 入口必须管理噪音、打扰和弱责任边界。 |
| 飞书 / Lark | Chat + docs + Base + approval | Suite-native work graph | Agent as cross-object operator | agent action 需要对象级权限、审批和可逆写入。 |
| Multica | Issue / task / runtime / agent | Coding-agent task ledger | Agent as AI engineer / worker | coding agent 最适合接收结构化 issue，并需要状态、runtime、usage 和 review。 |
| Paperclip | Company / goal / issue / agent org chart | Agent-company control plane | Agents as role-bearing workers inside governed teams | multi-agent work 需要 tickets、roles、budgets、heartbeats、governance 和 audit。 |
| OpenAI Symphony | Linear issue / isolated workspace / PR / CI / proof-of-work | Coding-agent orchestration harness | Issue tracker as control plane for Codex runs | agent 协作可以由任务对象驱动，而不是群聊；人 review work product 和异常。 |
| Agent Workbench | Mission / result surface / artifact / patch | Human-agent collaboration workbench | Agent team works in controlled runtime; human reviews result and authority gates | human-agent 协作需要 evidence、unknowns、approval、feedback patch 和 capability promotion gate。 |

## 5. Agent 进入地图

| 工作阶段 | 最佳参照 | Agent 机会 | 必要 guardrail |
| --- | --- | --- | --- |
| Intake | Linear Asks、Slack channels、Lark Messenger、Paperclip goals/issues | 把模糊输入转成 mission / issue / record | 确认用户意图，显示来源和缺失字段。 |
| Context assembly | Slack search、Lark Docs/Base、Linear projects、Symphony issue context | 拉取相关上下文并生成 evidence packet | 尊重 access control，引用 source object IDs。 |
| Task decomposition | Linear projects/issues、Task Room pattern | 拆分 specialist roles 和 artifacts | 保留 human owner 和明确完成条件。 |
| Delegation | Linear Agents、Multica agents、Slack agentic platform、OpenAI Symphony workspace runs | 把工作分配给 specialized agents / tools | 要求 scope、allowed actions、budget 和 rollback。 |
| Execution | Lark workflows、Slack Workflow Builder、Multica tasks、Paperclip heartbeats | 执行有边界的动作或草拟输出 | 对 external writes、spend、private data、irreversible action 做人审。 |
| Conflict resolution | Task Room arbiter、CI/test failure、review comments | 检测分歧并触发 re-query 或 escalation | 记录 claim、evidence、decision 和 unresolved risk。 |
| Result return | Slack thread、Linear update、Lark doc、PR/proof-of-work、Agent Workbench result surface | 返回压缩 decision / artifact / next action | 区分 facts、assumptions、recommendation、confidence 和 owner。 |
| Feedback patch | Agent Workbench Header Agent | 把人的自然反馈转成 task patch / contract update / rerun instruction | Header 的解释必须可见，可由人 confirm / edit / reject。 |

## 6. Guardrails 与 Human-In-The-Loop 模式

一个最小可靠的 agent collaboration contract:

```json
{
  "mission_id": "product_research_collab_tools_v1",
  "requester": "user_or_header_agent_id",
  "scope": "research, critique, opportunity judgment",
  "allowed_actions": ["read_public_sources", "draft_artifacts", "propose_next_steps"],
  "blocked_actions": ["send_external_message", "write_to_system_of_record", "spend_budget", "store_private_memory"],
  "human_checkpoints": [
    "approve low-confidence product identity",
    "approve final opportunity judgment",
    "approve reusable playbook writeback"
  ],
  "audit_fields": ["source_url", "claim", "confidence", "agent_role", "timestamp"]
}
```

Human-in-the-loop 应该在以下情况触发:

- agent 想超出 mission scope 行动。
- source confidence 低，或产品身份 / 事实不明确。
- 两个 agent 对结论或 evidence quality 有冲突。
- 下一步触达 private data、external communication、money、compliance 或 durable memory。
- artifact 要被转成 reusable playbook 或 registered capability。
- Header Agent 把人的自然语言反馈转成 task patch 时，需要展示解释结果并允许人 confirm / edit / reject。

## 7. Agent Workbench 机会判断

推荐 demo thesis:

> Agent Workbench 不应被定位成 Slack / Linear / 飞书的替代品，而应被定位成 human-agent collaboration workbench for one-person companies。

它应该解决的 gap 是:

- 用户有一个目标相对明确、但执行需要多个能力的任务。
- Header Agent 判断该走 direct answer、skill、single agent、Task Room、human interruption 还是 provisional capability proposal。
- Room Controller 从已注册能力中组成最小可靠执行路径。
- Agents 产出结构化 artifacts，而不是自由群聊。
- 结果默认包含 evidence、assumptions、unknowns、risk flags 和 human decision points。
- 用户在 result surface 上反馈，Header 把反馈解释成 task patch，但解释必须给用户确认。
- final output 可以写回 Slack、Linear、Lark、docs、tickets 或 playbooks，但写回必须人审。

这个定位与 JD 的连接点:

- Agent-agent collaboration protocol: room contract、artifact contract、capability registry、conflict log。
- Agent-human product form: Header Agent as boundary manager，result surface as decision interface。
- Delegation policy: allowed / needs approval / blocked，尤其是 external action、memory writeback、provisional agent promotion。
- Token efficiency: 压缩 context packet、只调用必要能力、确定性工作走 skill、artifact contract 满足即停止。
- Trust by design: result-first 必须带 evidence / unknowns，否则会把“自信垃圾”包装成完整结果。

## 8. Result-first 的适用边界

Result-first 是 Agent Workbench 的重要假设，但不能无限泛化。

适合:

- 目标相对明确的执行型任务，例如发布计划、岗位筛选、文案草案、onboarding plan、研究摘要、评测报告。
- 用户需要先看一个可判断版本，再快速反馈和迭代。
- 失败成本可控，且外部动作被 blocked。

不适合直接 result-first:

- 目标本身还不清楚的探索型任务。
- 需要价值观、战略方向或重大资源投入的决策。
- 高风险法律、医疗、财务、合规动作。
- 缺少 evidence 且 agent 容易生成“完整但错误”的结果。

因此 result-first 必须配套:

- evidence / assumptions / unknowns 默认可见。
- trace 可以收起执行噪音，但不能收起判断依据。
- 用户反馈转 patch 必须可确认。
- 外部动作、长期记忆和 provisional capability promotion 必须 human approval。

## 9. Open Task Room 迭代计划

如果要把这个静态 artifact 变成 Task Room 输出，可以跑四轮:

1. Research Synthesis Agent
   - 输出带来源和 source confidence 的 product cards。
   - 必要 artifact: `product_cards[]`。

2. Product Critic Agent
   - 挑战每个 positioning claim。
   - 标注 gaps、false comparisons 和 weak evidence。
   - 必要 artifact: `critique_notes[]`。

3. Collaboration Designer Agent
   - 把产品启发转成 agent intervention points、guardrails、A2A / HITL rules。
   - 必要 artifact: `agent_intervention_map[]`。

4. Arbiter / Room Controller
   - 解决冲突。
   - 输出 `conflict_log[]`、final opportunity judgment 和 reusable playbook delta。
   - 比较 Agent Workbench temporary Task Room 与 Paperclip persistent agent company model。

## 10. Demo 集成合约

建议前端展示 artifact shape:

```json
{
  "artifact_type": "product_research.collaboration_tools.v1",
  "title": "Linear / Slack / Lark / Multica / Paperclip / OpenAI Symphony Agent Entry Analysis",
  "source_confidence": [],
  "product_cards": [],
  "comparative_matrix": [],
  "agent_entry_map": [],
  "guardrails": [],
  "opportunity_judgment": {
    "recommendation": "Build a human-agent collaboration workbench, not another chat surface or issue tracker.",
    "confidence": "medium_high",
    "primary_risk": "Agent Workbench must avoid claiming it replaces Slack/Linear; its wedge is human-agent result review and capability loop."
  },
  "next_room_actions": [
    "compare Paperclip company model against temporary mission room",
    "compare Multica issue execution model against coding-agent task ledger",
    "run conflict critique",
    "generate 3-minute interview narrative",
    "write playbook delta"
  ]
}
```

## 11. 参考来源

- Linear Features: https://linear.app/features
- Linear Agents: https://linear.app/agents
- Linear Asks: https://linear.app/asks
- Linear Plan: https://linear.app/plan
- Linear Build: https://linear.app/build
- Linear Projects: https://linear.app/docs/projects
- Linear Issue relations: https://linear.app/docs/issue-relations
- Slack Features: https://slack.com/features
- Slack Agentic Platform: https://slack.com/features/agentic-platform
- Slackbot: https://slack.com/features/slackbot
- Slack AI Agents / Agentforce: https://slack.com/ai-agents
- Slack Workflow Builder: https://slack.com/features/workflow-automation
- Lark Messenger: https://www.larksuite.com/en_us/product/messenger
- Lark Base: https://www.larksuite.com/en_us/product/base
- Multica: https://multica.ai/
- Multica GitHub: https://github.com/multica-ai/multica
- Paperclip GitHub repo: https://github.com/paperclipai/paperclip
- OpenAI Symphony article: https://openai.com/index/open-source-codex-orchestration-symphony/
- OpenAI Symphony GitHub repo: https://github.com/openai/symphony
