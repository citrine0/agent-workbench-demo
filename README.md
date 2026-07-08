# Agent Workbench Demo

Standalone demo for an agent-native task completion platform.

The core product idea:

- Header Agent is the user-facing collaboration interface.
- Header Agent routes work to Skill, single Agent, Task Room, Header Gate, or Header-to-Header collaboration.
- Task Room is the capability-gap response: it assembles the smallest viable agent team when the task exceeds existing skills or a single agent.
- Room Controller runs the Task Room loop: execute, evaluate artifact quality, pass, retry, reroute, or escalate.
- Human attention is reserved for budget, authority, major conflict, peer review, and final result decisions.
- Runtime model routing optimizes task completion probability within budget and authority boundaries, not cost alone.

The demo narrative:

```text
Header Agent detects a capability gap
→ Task Room assembles the minimum viable agent team
→ Room Controller runs the smallest path to a decision-grade result
→ Human feedback accepts, revises, or saves the result as reusable capability
```

## Run

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Key Files

- `web/src/app/page.tsx`: full frontend interaction demo.
- `web/src/data/agent_workbench_eval_cases.json`: 5 structured eval cases and the `HeaderAgentDecision` output contract.
- `web/src/lib/llm-connector.ts`: LLM connector contract and provider/model-to-env mapping.
- `api.py`, `orchestrator.py`, `llm_client.py`: selected backend/harness files from the old collaboration demo.
- `agents/`, `prompts/`, `skills/`, `data/`, `output/`: selected non-web assets from the old collaboration demo.

## LLM Connector

The main UI defaults to local fallback data. A collapsed `Advanced LLM connector` panel is available inside the Header Agent command area.

Current connector behavior:

- `fallback`: no network call, uses local fixture decision data. It does not represent a provider or model.
- `server_route`: posts a `HeaderAgentRequest` to `web/src/app/api/header-agent/decision/route.ts`.

The backend route is server-side because model API keys must not be exposed in the browser.

In the UI, open `Advanced LLM connector` under Header Agent Command to switch:

- run mode: `Local fixture` or `Server env`
- provider: DeepSeek / Kimi / MiniMax / GLM / Custom
- model: provider-specific preset or any manually typed model name
- frontend route: defaults to `/api/header-agent/decision`
- provider endpoint override: required only for custom or OpenAI-compatible providers
- server env key: defaults to `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `MINIMAX_API_KEY`, `GLM_API_KEY`, or `CUSTOM_LLM_API_KEY`

The built-in provider routes use OpenAI-compatible chat completion APIs:

- DeepSeek: `https://api.deepseek.com/chat/completions`
- Kimi / Moonshot: `https://api.moonshot.cn/v1/chat/completions`
- MiniMax: `https://api.minimaxi.com/v1/chat/completions`
- GLM / Z.AI: `https://api.z.ai/api/paas/v4/chat/completions`

For server-side keys, create `web/.env.local` from `web/.env.example`, add the provider key, and restart `npm run dev`.

DeepSeek is wired to `deepseek-v4-pro`. The local env mapping is:

```env
DEEPSEEK_API_KEY=
LLM_MODEL_API_KEY_ENV_MAP={"deepseek-v4-pro":"DEEPSEEK_API_KEY"}
```

When the frontend model selector changes, the selected model and its mapped server env var are posted to `/api/header-agent/decision`, and that route calls the selected OpenAI-compatible provider endpoint.

## Eval Contract

The demo evaluates structured Header Agent decisions, not long-form answer quality.

Expected model output shape:

- route
- runtime_policy
- model_plan
- budget_required
- needs_task_room
- skills / agents
- artifact_contract
- allowed_actions
- needs_approval
- blocked_actions
- escalation_required
- header_to_header_request
