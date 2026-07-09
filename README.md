# Agent Workbench Demo

面向"一人公司"的人-Agent 协作 harness 原型。

一个人 + 一支他自己构建、评测、编排的 agent 队伍,把想法可靠地跑成现实。这里把 **agent 之间的协作本身**当作一种新型 harness 来设计——最大化模型能力向任务完成率的转化。

> **诚实边界(先读这条)**:仓库含两层。**当前跑通**的是 `workbench-v2`(路径 `/workbench-v2`);**北极星架构**(artifact 协作、动态组队、构建 new agent)在 `orchestrator.py` 里成型,但未被任何 v2 路由调用,属设计层。下文严格区分"现在真有的"和"设计要去的"。

## 一、当前跑通(workbench-v2 实测)

v2 页面对接 4 条真实后端路由,行为都可现场复现:

| 路由 | 状态 | 实际做什么 |
|---|---|---|
| `/api/workbench-v2/route` | live LLM | Header = 真实 DeepSeek,只判断 route + 需要的 capabilities(不选具体 agent、不执行);随后 Controller 确定性映射到执行计划 |
| `/api/workbench-v2/registry` | live | 读统一 registry(skills / agents + 各自 trust_tier) |
| `/api/workbench-v2/run-boss-skill` | live · 真跑 Python | 后端 API 用 Node `execFile` 调 `python3 run_workflow.py`,**执行是真的,输入是 `--source sample` 的 fixture 数据**(非 live BOSS 抓取) |
| `/api/workbench-v2/certify-agent` | live · 双 LLM | Product Critic 认证流,见下 |

**Header → Controller 的真实行为**:Header(DeepSeek)判完能力需求后,`resolveControllerPlan` 是一段**确定性映射**——按 required_capabilities 落到四个固定结果之一:`verified_skill`(boss_job_fit_skill)/ `declared_agent`(product_critic_agent)/ `task_room_plan`(仅计划,不执行)/ `validated_gap`(无覆盖)。这里**没有真正的动态组队,也没有 agent builder**;组队与造 agent 是下面的设计层。

**Product Critic 认证流**(信任分层的可跑演示):DeepSeek 作被测 agent 产出批判 → **确定性 scorer 检查 required_terms 覆盖、forbidden_recommendations 命中、字段完整性**(`expected_findings` 只放进 prompt 引导,不被 scorer 直接判定)→ Kimi(Moonshot)作 external LLM judge 复审 scorer 有没有漏判。护栏在代码层写死:`human_approval_required: true`、`registry_writeback_allowed: false`,过 eval 也只是 `eligible_for_human_approval`。

> 页面已标注:这是 **contract compliance,不是 blind quality** —— 只验证 agent 是否遵守输出契约,不证明它在开放产品评审中全面可靠。
>
> 代码:Header=`route/route.ts` + `normalizeHeaderDecision` / Controller=`resolveControllerPlan` / Eval=`scoreProductCriticCase`(`web/src/lib/workbench-v2.ts`)

**边界:v2 尚无任何 contract 治理对象。** v2 是下面那套 Task Room 设计思想的**可信执行切片**——只落地了 registry resolve + 真实 skill 执行(artifact 真、输入 sample)+ Product Critic contract-compliance eval。设计层里的 `collaboration_contract` / `room_state_contract` / `artifact_inventory` / `evidence_ledger` 在 v2 代码里**均不存在**(唯一带 "contract" 的是 eval 名 `deterministic_contract_compliance`);v2 的 Controller 只做 `resolveControllerPlan` 那段确定性映射,不产出、不维护任何 contract。

## 二、北极星架构(orchestrator 设计层,未打通)

以下是这个项目想去的地方——在 `orchestrator.py`(120KB)里已成型为代码,但**未被任何 v2 HTTP route 调用**,是设计构想而非当前能力。它才是"把协作做成 harness"的完整主张:

### 1. 协作媒介:contract 治理协作,artifact 是产物

设想中 Controller / Room 层用 **contract 治理协作**,agent 产出的是 **artifact**,两者是"骨架"与"填进骨架的产物"的关系:

- `collaboration_contract` 定授权与边界(`authorization_scope` / blocked_actions)
- `artifact_contract` 定每个 agent 的输出规格(该产出什么、什么 schema)
- `room_state_contract` 存可恢复的协作状态(`resume_mode: contract_state_only` + resume_instructions + discarded_context)

agent 按 artifact_contract 产出 **artifact**(统一 schema:`judgment / key_findings / evidence / risks / missing_information / next_validation_step / confidence`,上下文经 context packet 的 `necessary_context` / `excluded_context` 显式裁剪)。Controller 把 artifact 摘要清点进 `artifact_inventory` 与 `evidence_ledger`,**对外只回传压缩后的 contract state + artifact 清单,不回传原始 room trace**。

> 一句话:**contract 是协作的骨架(规格 + 边界 + 可恢复状态),artifact 是填进骨架的产物。** → `_build_room_state_contract` / `_build_context_packets`

### 2. 缺口 resolve 链:组队 → 组不出 → 构建最小路径 new agent

```
任务 → Controller 从 registry 找已 verified 能力覆盖
        ├─ 找到 → 动态组成最小可行队伍执行
        └─ 覆盖不了 → capability gap
                 → 沿 minimal_path 提 candidate new agent (candidate_only)
                 → agent_builder_call.status = proposed_not_executed（刻意不自动执行）
```

为什么要能造 new agent:一个人用 agent 探索自己真正想做的事,**预置 agent 不可能全覆盖**。动态组合失败时,系统的下一步是沿最小路径构建新 agent,而不是放弃。 → `_candidate_agent_spec` / `_build_capability_gap_report`

### 3. 信任的由来:new agent 只能是 declared

新造 agent 未经验证,先声明为 **declared**(标 unverified、不能写记忆 / 污染 verified 链、必过人工 checkpoint),要过 eval_gate(4 条门槛)+ 人工批准才注册为 registered,多次稳定复用才可能升级 skill。**这就是 trust_tier 存在的原因**:动态构建 + 探索未知这条路天然产出未验证能力,需要一套原语安全地表达"新东西还不可信"。

> 前提假设:要有**足够多的基础功能 agent 打底**,动态组队才有料可组。设计层假设底层已有一批 verified 基础能力,重点演示缺口 resolve 与信任分层,不是从零堆 agent 数量。

> 根路径 `/`(`web/src/app/page.tsx`)是这套设计层的前端叙事视图(Header 检测缺口 → Task Room 组队 → Controller 跑闭环 → 人工反馈),同样未与真实执行打通。区分"已跑通 / 设计中"本身,就是这个 demo 想表达的判断力。

## trust_tier 五档

| 档位 | 含义 |
|---|---|
| `verified` | 过 eval 挣来;可进执行队列 |
| `declared` | 有契约没 eval;标 unverified,不能写记忆 / 污染 verified 链,必过人工 checkpoint |
| `deterministic` | 纯代码,行为确定 |
| `provisional` | 试用观察中 |
| `excluded_by_design` | 刻意排除 |

`declared → verified` 需 benchmark + 人工批准。**Registry 只代表可发现,不代表可信;可靠性是挣来的,不是被赋予的。**

## 运行

```bash
cd web
npm install
npm run dev
```

- `http://localhost:3000/workbench-v2` —— **当前跑通的版本**
- `http://localhost:3000/` —— 北极星架构的前端叙事视图(设计层,未与真实执行打通)

## LLM 连接器与运行模式

两层的运行模式不同,别混:

| 页面 | 运行模式 | 缺 key 会怎样 |
|---|---|---|
| legacy `/` | 可走本地 fixture,不必发网络请求 | 正常展示 fixture |
| **v2 `/workbench-v2`** | Header route 与 Product Critic 认证都是 **live LLM**;Boss skill 是**真实执行 / sample 数据** | **直接报错**(`missing_api_key`),不会 fixture 成功 |

要跑 v2 的真实路径,配置服务端 key:

1. 从 `web/.env.example` 复制出 `web/.env.local`
2. 填入 key —— 认证流需要 `DEEPSEEK_API_KEY` + `MOONSHOT_API_KEY` 两个(judge 必须是另一个模型);Header route 至少需要 `DEEPSEEK_API_KEY`
3. 重启 `npm run dev`

key 只放服务端,不暴露给浏览器。内置 provider 走 OpenAI 兼容接口:DeepSeek / Kimi(Moonshot)/ MiniMax / GLM。

## 关键文件

- `web/src/app/workbench-v2/page.tsx`:v2 前端(真跑通)
- `web/src/app/api/workbench-v2/*`:4 条 v2 后端路由
- `web/src/lib/workbench-v2.ts`:registry 读取、Header/Controller resolve、确定性打分器
- `skills/boss-job-fit/scripts/run_workflow.py`:被真实调用的 Python skill
- `data/workbench_registry.json`:能力 registry 与 trust_tier 定义
- `orchestrator.py`:完整编排设计层(设计构想,未打通)

