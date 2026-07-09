# Agent Workbench Demo

面向"一人公司"的人-Agent 协作 harness 原型。

核心命题:主流协作产品(Linear / Slack / 飞书)的内核对象都是一支人类团队,天然缺三样一等原语——**信任分层、委派边界、人工 checkpoint**。它们能控制 agent *能做什么*(cage / 权限),却评估不了这次产出*可不可信*(credential)。本 demo 用 **trust_tier** 补这一层:可靠性是挣来的,不是被赋予的。

> **诚实边界**:仓库含两个版本。`workbench-v2`(`/workbench-v2`)是实际跑通的版本;根路径 `/` 的旧编排视图是设计构想,尚未完成前后端联调。下文明确区分。

## workbench-v2:真跑通的部分

v2 页面(`web/src/app/workbench-v2/page.tsx`)对接 4 条真实后端路由:

| 路由 | 状态 | 做什么 |
|---|---|---|
| `/api/workbench-v2/registry` | live | 读统一能力 registry(skills / agents 及各自 trust_tier) |
| `/api/workbench-v2/route` | live | Header 只判断能力需求;Controller 从 registry 确定性 resolve 执行方式 |
| `/api/workbench-v2/run-boss-skill` | live · 真跑 Python | job-fit skill 经 eval 认证(tier=verified),前端真实 `execFile python3 run_workflow.py` |
| `/api/workbench-v2/certify-agent` | live · 双 LLM | Product Critic 认证流,详见下节 |

### Product Critic 认证流(信任分层的核心演示)

这是回答"agent 凭什么从 declared 升到 verified"的机制:

- **被测 agent**:DeepSeek 作为 Product Critic,按 certification case 产出批判(risks / counterarguments / recommendation / human_review_questions)
- **确定性打分器**:检查产出是否原样包含 required_terms、是否命中 expected_findings、是否踩 forbidden_recommendations
- **external LLM judge**:Kimi / Moonshot 作为第二个不同模型,复审确定性打分器有没有漏掉信任问题
- **强制护栏(代码层写死)**:`human_approval_required: true`、`registry_writeback_allowed: false` —— 过了 eval 也只是 `eligible_for_human_approval`,升级必须人工批准,禁止自动回写 registry

一句话:没过 eval 的 agent 跑起来就是 confident garbage,所以自动造 agent、自动回写这一步被刻意卡在 eval 闸和人工 checkpoint 之后。

## 设计中(未打通)

根路径 `/`(`web/src/app/page.tsx`)展示更完整的编排叙事,但**仅为设计构想,未完成前后端联调**:

```text
Header Agent 检测能力缺口
 → Task Room 组装最小可行 agent 队伍
 → Room Controller 跑 execute / evaluate / retry / reroute / escalate 闭环
 → 人工反馈:接受 / 修订 / 存为可复用能力
```

其中 Task Room 计划视图只展示 artifact-first 的 room 计划,**不宣称已经执行 multi-agent room**。这部分是架构专门为之设计的下一步,故意停在验证之前——区分"已跑通 / 设计中"本身就是这个 demo 想表达的判断力。

## trust_tier 五档

| 档位 | 含义 |
|---|---|
| `verified` | 过 eval 挣来;可进执行队列 |
| `declared` | 有契约没 eval;输出标 unverified,不能写记忆、不能污染 verified 链、必须过人工 checkpoint |
| `deterministic` | 纯代码,行为确定 |
| `provisional` | 试用观察中 |
| `excluded_by_design` | 刻意排除 |

`declared → verified` 需要 benchmark + 人工批准。**Registry 只代表可发现,不代表可信。**

## 运行

```bash
cd web
npm install
npm run dev
```

打开 `http://localhost:3000/workbench-v2`(真跑通的版本)。根路径 `/` 是设计构想视图。

## LLM 连接器

demo 默认走本地 fixture,不发网络请求。要跑真实认证流(`certify-agent`)和真实模型路由,需配置服务端 key:

1. 从 `web/.env.example` 复制出 `web/.env.local`
2. 填入 provider key(认证流需要 `DEEPSEEK_API_KEY` + `MOONSHOT_API_KEY` 两个,因为 judge 必须是另一个模型)
3. 重启 `npm run dev`

key 只放服务端,绝不暴露给浏览器。内置 provider 走 OpenAI 兼容 chat completion 接口:DeepSeek / Kimi(Moonshot)/ MiniMax / GLM。

## 关键文件

- `web/src/app/workbench-v2/page.tsx`:v2 前端(真跑通)
- `web/src/app/api/workbench-v2/*`:4 条 v2 后端路由
- `web/src/lib/workbench-v2.ts`:registry 读取、确定性打分器、OpenAI 兼容调用
- `skills/boss-job-fit/scripts/run_workflow.py`:被真实调用的 Python skill
- `data/workbench_registry.json`:能力 registry 与 trust_tier 定义
- `web/src/app/page.tsx`:旧编排视图(设计构想)

