# Agent Workbench Demo

投递版主线只保留一条：先判断该不该开 room，再用最小可信团队产 artifact，最后用 A/B 证明少回传原始 trace 也能保持下游决策一致。

## 当前主线

- 入口：`/workbench-v2`
- 默认首页：重定向到 `/workbench-v2`
- 设计层：`orchestrator.py` 只作为 collapsed evidence，不进 runtime

## 这版 demo 在讲什么

1. `room admission`：同一套机制先判“不该开 room”还是“该开 room”
2. `artifact handoff`：Agent A 的 artifact 先过 contract，再交给 Agent B
3. `protocol A/B`：同一任务跑两遍，比较 raw trace 和 compressed state 的 token 成本
4. `checkpoint + playbook`：默认停在 declared，只有通过 eval + 人审才谈复用

## 运行

```bash
cd web
npm install
npm run dev
```

四条主线路由都是 live LLM，缺 key 会返回 400：

- `route`：DeepSeek，`DEEPSEEK_API_KEY`
- `artifact-handoff` / `protocol-ab` / `certify-agent`：Kimi，`MOONSHOT_API_KEY`

只有 Beat 2 里 Agent B 那一格是例外——它是写在 route 里的确定性闸门（contract 校验 + confidence 阈值），不消耗 token。

## 实测数字

`protocol-ab` 的 token 对比取自 provider 上报的 `usage.total_tokens`，不是估算。2026-08-01 一次实跑：

| 回传方式 | tokens | 下游决策 |
| --- | --- | --- |
| raw trace 全量回传 | 2450 | Review |
| compressed state + artifact 清单 | 1627 | Review |

省 823 tokens（34%），决策一致。但 raw 那跑多列了一个 `contract_version` 作为依据字段，所以页面上是 `basis identical: no`——结论一致不等于依据一致，这一栏没有粉饰。

## 关键文件

- `web/src/app/workbench-v2/page.tsx`: 投递版主线页面
- `web/src/app/api/workbench-v2/route/route.ts`: room admission
- `web/src/app/api/workbench-v2/artifact-handoff/route.ts`: artifact 交接
- `web/src/app/api/workbench-v2/protocol-ab/route.ts`: raw vs compressed A/B
- `web/src/app/api/workbench-v2/certify-agent/route.ts`: trust gate
- `web/src/lib/workbench-v2.ts`: registry、路由解释、交接和 A/B 共享逻辑
- `orchestrator.py`: 设计层证据
