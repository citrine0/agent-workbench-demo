"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FileJson2,
  FileText,
  GitBranch,
  Inbox,
  Layers3,
  LockKeyhole,
  Play,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import evalData from "@/data/agent_workbench_eval_cases.json";
import {
  buildHeaderAgentRequest,
  defaultLlmConnectorConfig,
  providerApiKeyEnv,
  providerModelPresets,
  requestHeaderAgentDecision,
  resolveApiKeyEnv,
  type LlmConnectorConfig,
} from "@/lib/llm-connector";
import {
  createRoomPlan,
  defaultProductResearchContract,
  type HeaderDecisionContract,
  type RoomPlan,
  type RouterCheck,
} from "@/lib/room-planning";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

type RuntimePolicyId = "low_cost" | "balanced" | "deep_research";
type MissionStatus = "running" | "needs_review" | "paused" | "done";
type MissionPhase =
  | "Route"
  | "Contract"
  | "Research"
  | "Compare"
  | "Merge"
  | "Review"
  | "Result";
type RouteType =
  | "skill"
  | "single_agent"
  | "workflow_skill"
  | "task_room"
  | "header_gate_escalation"
  | "header_to_header";
type MissionRouteType = "skill" | "single_agent" | "task_room" | "header_to_header";

type HeaderAgentDecision = {
  case_id: string;
  route: RouteType;
  confidence: number;
  runtime_policy: RuntimePolicyId;
  gap_reason?: string;
  required_capabilities?: string[];
  budget_required: boolean;
  budget_cap_suggestion: number | null;
  needs_task_room: boolean;
  skills?: string[];
  agents: string[];
  artifact_contract: string[];
  allowed_actions: string[];
  needs_approval: string[];
  blocked_actions: string[];
  escalation_required: boolean;
  escalation_reason: string | null;
  auto_pass: boolean;
  header_to_header_request: {
    recipient_role: string;
    context_summary: string;
    requested_decision: string;
    permission_boundary: string[];
  } | null;
  evaluation_notes: string[];
};

type EvalCase = {
  case_id: string;
  name: string;
  category: string;
  input: string;
  expected: {
    route: RouteType;
    acceptable_routes?: RouteType[];
    needs_task_room?: boolean;
    runtime_policy?: RuntimePolicyId;
    budget_required?: boolean;
    escalation_required?: boolean;
    auto_pass?: boolean;
    must_include_skills?: string[];
    must_include_agents?: string[];
    must_include_artifacts?: string[];
    must_include_needs_approval?: string[];
    must_include_blocked_actions?: string[];
    must_include_escalation_reason?: string[];
    must_include_header_to_header_request?: boolean;
    must_include_permission_boundary?: string[];
    must_include_context_summary?: boolean;
  };
  simulated_output: HeaderAgentDecision;
};

type Mission = {
  id: string;
  title: string;
  goal: string;
  routeType: MissionRouteType;
  status: MissionStatus;
  phase: MissionPhase;
  progress: number;
  budgetCap: number;
  spent: number;
  projectedNextSpend: number;
  headerAutoPassed: number;
  headerSummarized: number;
  agents: string[];
  artifacts: string[];
  timeline: string[];
  result?: string;
};

type HeaderAgentRunState = {
  status: "idle" | "running" | "success" | "error";
  source: LlmConnectorConfig["mode"];
  provider?: LlmConnectorConfig["provider"];
  model?: string;
  apiKeyEnv?: string;
  endpoint?: string;
  decision?: Partial<HeaderDecisionContract>;
  routerCheck?: RouterCheck;
  roomPlan?: RoomPlan;
  message: string;
  detail?: string;
};

const runtimePolicies: Record<
  RuntimePolicyId,
  {
    label: string;
    budget: number;
    objective: string;
    routingRule: string;
    description: string;
  }
> = {
  low_cost: {
    label: "Fast Path",
    budget: 3,
    objective: "在任务边界清晰时快速得到可判断结果。",
    routingRule: "低风险步骤快速通过；若证据不足或置信度下降，暂停升级给 Header Agent。",
    description: "适合稳定 Skill、公开信息整理和低风险判断。目标是在较小边界内保持可接受完成率。",
  },
  balanced: {
    label: "Balanced",
    budget: 5,
    objective: "默认策略，在预算边界内最大化任务完成率。",
    routingRule: "拆解、合成和角色分配优先保证质量；格式化、聚类和低风险检查保持轻量。",
    description: "适合大多数复杂任务。Room Controller 会按步骤风险和 artifact 质量选择执行路径。",
  },
  deep_research: {
    label: "High Confidence",
    budget: 8,
    objective: "当任务成败依赖高质量判断时，优先提升完成概率。",
    routingRule: "冲突合并、最终判断和高风险授权点必须加强审查；超出边界时请求人确认。",
    description: "适合高不确定性研究、重大冲突合并和最终策略判断。边界是约束，成功率是目标。",
  },
};

const phaseLabels: Record<MissionPhase, string> = {
  Route: "Gap",
  Contract: "Contract",
  Research: "Research",
  Compare: "Critique",
  Merge: "Synthesis",
  Review: "Human Check",
  Result: "Capability",
};

const agentRoleDescriptions: Record<string, string> = {
  "Research Agent": "收集证据并形成 research brief",
  "Product Critic Agent": "寻找反例、风险和定位冲突",
  "Collaboration Designer Agent": "把机会点转成 agent 协作协议",
  "QA Agent": "检查 artifact contract 和结论可用性",
  "Signal Agent": "聚合公开反馈信号",
  "Summarize Skill": "复用稳定摘要能力",
};

const routeTypeMeta: Record<
  MissionRouteType,
  {
    label: string;
    className: string;
    description: string;
    fit: string;
  }
> = {
  skill: {
    label: "Skill",
    className: "border-emerald-300 bg-emerald-50 text-emerald-900",
    description: "Header Agent 复用已有稳定能力，直接产出结果。",
    fit: "已有 Skill 可覆盖",
  },
  single_agent: {
    label: "Single Agent",
    className: "border-sky-300 bg-sky-50 text-sky-900",
    description: "Header Agent 委托一个专门 agent 执行，不需要开启 Task Room。",
    fit: "单 Agent 可完成",
  },
  task_room: {
    label: "Task Room",
    className: "border-zinc-300 bg-zinc-950 text-white",
    description: "Header Agent 识别能力缺口，开启最小可行 Agent Team。",
    fit: "超出现有 Skill / 单 Agent",
  },
  header_to_header: {
    label: "Header-to-Header",
    className: "border-violet-300 bg-violet-50 text-violet-900",
    description: "Header Agent 向另一个人的 Header Agent 发起压缩协作请求。",
    fit: "需要跨人协作判断",
  },
};

const exampleFeedbackPatch = {
  patch_type: "scope_delta",
  user_feedback: "聚焦 agent 协作协议，不要展开普通 SaaS 对比",
  header_interpretation: [
    "focus collaboration protocol",
    "require reusable skill section",
    "keep budget and authority boundary unchanged",
  ],
  room_controller_patch: {
    rerun_steps: ["collaboration_design", "merge"],
    keep_artifacts: ["research_brief", "comparison_matrix"],
    quality_gate_delta: "final result must include reusable skill candidate",
  },
  contract_update_candidate: true,
};

const legacyTruthRows = [
  {
    layer: "Header routing",
    status: "live LLM / fixture",
    detail: "Only the routing decision can call a live model; fallback uses local fixture data.",
  },
  {
    layer: "Controller planning",
    status: "frontend deterministic planner",
    detail: "This legacy view uses a local planning registry, not the Python orchestrator.",
  },
  {
    layer: "Agent execution",
    status: "simulated",
    detail: "Agent cards show planned roles and artifact contracts, not verified execution.",
  },
  {
    layer: "Task Room artifacts",
    status: "planned / fixture",
    detail: "Artifacts show the intended collaboration surface and merge contract.",
  },
  {
    layer: "Eval panel",
    status: "routing eval only",
    detail: "It evaluates HeaderAgentDecision structure, not agent output quality.",
  },
  {
    layer: "Backend orchestrator",
    status: "not connected here",
    detail: "Trusted runtime execution is intended for the separate /workbench-v2 slice.",
  },
];

const taskRoomArtifactContracts = [
  {
    title: "Header Contract",
    body: "goal, required capabilities, approval boundary, blocked actions",
  },
  {
    title: "Planned Agent Artifacts",
    body: "research brief, comparison matrix, risk notes, protocol draft",
  },
  {
    title: "Conflict Log",
    body: "claims in tension, missing evidence, unresolved assumptions",
  },
  {
    title: "Merge Rule",
    body: "facts before recommendations; unresolved risk stays visible",
  },
];

const humanCheckpointItems = [
  "final recommendation",
  "external action",
  "memory writeback",
  "budget or scope change",
  "capability promotion",
];

const defaultTask = "研究 Cursor / Windsurf / Devin 的产品定位，并输出进入机会判断";
const agentWorkbenchEvalCases = evalData.eval_cases as EvalCase[];
const phaseOrder: MissionPhase[] = [
  "Route",
  "Contract",
  "Research",
  "Compare",
  "Merge",
  "Review",
  "Result",
];

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function remainingBudget(mission: Mission) {
  return Math.max(0, mission.budgetCap - mission.spent);
}

function createProductResearchRoom(
  policyId: RuntimePolicyId,
  contract: Partial<HeaderDecisionContract> = defaultProductResearchContract,
  roomPlan: RoomPlan = createRoomPlan(contract),
): Mission {
  const policy = runtimePolicies[policyId];
  const capabilities =
    contract.required_capabilities?.length
      ? contract.required_capabilities
      : defaultProductResearchContract.required_capabilities;
  const artifactContract =
    roomPlan.artifact_contract.length > 0
      ? roomPlan.artifact_contract
      : defaultProductResearchContract.artifact_contract;
  const coverageSummary = roomPlan.coverage
    .map((item) => `${item.capability} → ${item.agent} (${Math.round(item.coverage_score * 100)}%)`)
    .join("；");

  return {
    id: "product-research",
    title: "Product Research",
    goal: defaultTask,
    routeType: "task_room",
    status: "running",
    phase: "Research",
    progress: 24,
    budgetCap: policy.budget,
    spent: policyId === "deep_research" ? 1.42 : 0.82,
    projectedNextSpend: policyId === "low_cost" ? 0.76 : 1.38,
    headerAutoPassed: 4,
    headerSummarized: 1,
    agents: roomPlan.agents.length ? roomPlan.agents : createRoomPlan(contract).agents,
    artifacts: ["room contract"],
    timeline: [
      `Header Agent 识别能力缺口：${contract.gap_reason ?? defaultProductResearchContract.gap_reason}`,
      `Execution strategy: ${policy.label}；目标是 ${policy.objective}`,
      `用户授权预算边界 ${formatMoney(policy.budget)}，Room Controller 在边界内最大化完成概率。`,
      `Header Agent 输出 required capabilities：${capabilities.join(" → ")}。`,
      `Room Controller 根据 legacy planning registry 先过滤候选，再按 capability coverage 与 planning heuristic 选择最小可行 team：${roomPlan.agents.join(" → ")}。`,
      `Capability coverage：${coverageSummary}。`,
      `Room Controller 生成 artifact contract：${artifactContract.join(" → ")}。`,
      `Runtime routing rule: ${policy.routingRule}`,
    ],
  };
}

const initialMissions: Mission[] = [
  {
    id: "market-scan",
    title: "Market Scan",
    goal: "追踪本周 AI coding 工具的公开发布与用户反馈",
    routeType: "single_agent",
    status: "running",
    phase: "Research",
    progress: 46,
    budgetCap: 3,
    spent: 1.08,
    projectedNextSpend: 0.42,
    headerAutoPassed: 8,
    headerSummarized: 1,
    agents: ["Research Agent", "Signal Agent"],
    artifacts: ["source notes"],
    timeline: [
      "Header Agent 判定为单个 Research Agent 可处理。",
      "公开来源检索在授权范围内，自动通过。",
      "Research Agent 正在聚合用户反馈，不需要开启 Task Room。",
    ],
  },
  {
    id: "report-brief",
    title: "Report Brief",
    goal: "把昨天的访谈记录整理成一页产品判断",
    routeType: "skill",
    status: "done",
    phase: "Result",
    progress: 100,
    budgetCap: 2,
    spent: 0.86,
    projectedNextSpend: 0,
    headerAutoPassed: 5,
    headerSummarized: 0,
    agents: ["Summarize Skill"],
    artifacts: ["one-page brief", "quote index"],
    timeline: [
      "Header Agent 判定为稳定 Skill。",
      "Summarize Skill 完成结构化摘要。",
      "结果已归档，可复用为 briefing 模板。",
    ],
    result: "访谈主要指向同一个问题：用户不缺 AI 入口，缺少可追踪的协作闭环。",
  },
];

function evaluateDecision(evalCase: EvalCase) {
  const output = evalCase.simulated_output;
  const expected = evalCase.expected;
  const failures: string[] = [];
  const routes = expected.acceptable_routes ?? [expected.route];

  if (!routes.includes(output.route)) {
    failures.push(`route expected ${routes.join(" or ")}, got ${output.route}`);
  }
  if (
    typeof expected.needs_task_room === "boolean" &&
    output.needs_task_room !== expected.needs_task_room
  ) {
    failures.push(`needs_task_room expected ${expected.needs_task_room}`);
  }
  if (expected.runtime_policy && output.runtime_policy !== expected.runtime_policy) {
    failures.push(`runtime_policy expected ${expected.runtime_policy}`);
  }
  if (
    typeof expected.budget_required === "boolean" &&
    output.budget_required !== expected.budget_required
  ) {
    failures.push(`budget_required expected ${expected.budget_required}`);
  }
  if (
    typeof expected.escalation_required === "boolean" &&
    output.escalation_required !== expected.escalation_required
  ) {
    failures.push(`escalation_required expected ${expected.escalation_required}`);
  }
  if (typeof expected.auto_pass === "boolean" && output.auto_pass !== expected.auto_pass) {
    failures.push(`auto_pass expected ${expected.auto_pass}`);
  }

  for (const item of expected.must_include_skills ?? []) {
    if (!(output.skills ?? []).includes(item)) failures.push(`missing skill: ${item}`);
  }
  for (const item of expected.must_include_agents ?? []) {
    if (!output.agents.includes(item)) failures.push(`missing agent: ${item}`);
  }
  for (const item of expected.must_include_artifacts ?? []) {
    if (!output.artifact_contract.includes(item)) failures.push(`missing artifact: ${item}`);
  }
  for (const item of expected.must_include_needs_approval ?? []) {
    if (!output.needs_approval.includes(item)) failures.push(`missing approval: ${item}`);
  }
  for (const item of expected.must_include_blocked_actions ?? []) {
    if (!output.blocked_actions.includes(item)) failures.push(`missing blocked action: ${item}`);
  }
  for (const item of expected.must_include_escalation_reason ?? []) {
    if (!output.escalation_reason?.includes(item)) {
      failures.push(`missing escalation reason: ${item}`);
    }
  }
  if (expected.must_include_header_to_header_request && !output.header_to_header_request) {
    failures.push("missing header_to_header_request");
  }
  for (const item of expected.must_include_permission_boundary ?? []) {
    if (!output.header_to_header_request?.permission_boundary.includes(item)) {
      failures.push(`missing permission boundary: ${item}`);
    }
  }
  if (
    expected.must_include_context_summary &&
    !output.header_to_header_request?.context_summary
  ) {
    failures.push("missing context_summary");
  }

  return { passed: failures.length === 0, failures };
}

export default function AgentWorkbenchDemoPage() {
  const [command, setCommand] = useState(defaultTask);
  const [runtimePolicy, setRuntimePolicy] = useState<RuntimePolicyId>("balanced");
  const [llmConnector, setLlmConnector] = useState<LlmConnectorConfig>(
    defaultLlmConnectorConfig,
  );
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [routeDialogOpen, setRouteDialogOpen] = useState(false);
  const [headerAgentRun, setHeaderAgentRun] = useState<HeaderAgentRunState>({
    status: "idle",
    source: defaultLlmConnectorConfig.mode,
    message: "Header Agent has not been called in this session.",
  });
  const [evalDialogOpen, setEvalDialogOpen] = useState(false);
  const [selectedEvalId, setSelectedEvalId] = useState(agentWorkbenchEvalCases[0]?.case_id);

  const activeMission = useMemo(
    () => missions.find((mission) => mission.id === activeMissionId) ?? null,
    [activeMissionId, missions],
  );
  const selectedEval = useMemo(
    () =>
      agentWorkbenchEvalCases.find((item) => item.case_id === selectedEvalId) ??
      agentWorkbenchEvalCases[0],
    [selectedEvalId],
  );

  async function openRoutingDecision() {
    if (!command.trim()) return;
    const request = buildHeaderAgentRequest(command, runtimePolicy);
    setHeaderAgentRun({
      status: "running",
      source: llmConnector.mode,
      provider: llmConnector.mode === "server_route" ? llmConnector.provider : undefined,
      model: llmConnector.mode === "server_route" ? llmConnector.model : undefined,
      apiKeyEnv: llmConnector.mode === "server_route" ? llmConnector.apiKeyEnv : undefined,
      endpoint: llmConnector.mode === "server_route" ? llmConnector.endpoint : undefined,
      message: "Header Agent is checking route, budget, agent team, and approval boundary.",
    });
    setRouteDialogOpen(true);

    try {
      const result = await requestHeaderAgentDecision(llmConnector, request);
      const decision =
        typeof result?.decision === "object" && result.decision
          ? (result.decision as Partial<HeaderDecisionContract>)
          : undefined;
      const routerCheck =
        typeof result?.router_check === "object" && result.router_check
          ? (result.router_check as RouterCheck)
          : undefined;
      const roomPlan =
        typeof result?.room_plan === "object" && result.room_plan
          ? (result.room_plan as RoomPlan)
          : decision
            ? createRoomPlan(decision)
            : undefined;
      setHeaderAgentRun({
        status: "success",
        source: llmConnector.mode,
        provider: llmConnector.mode === "server_route" ? llmConnector.provider : undefined,
        model: llmConnector.mode === "server_route" ? llmConnector.model : undefined,
        apiKeyEnv:
          llmConnector.mode === "server_route"
            ? result?.apiKeyEnv ?? llmConnector.apiKeyEnv
            : undefined,
        endpoint:
          llmConnector.mode === "server_route"
            ? result?.endpoint ?? llmConnector.endpoint
            : undefined,
        decision,
        routerCheck,
        roomPlan,
        message:
          llmConnector.mode === "fallback"
            ? "Using local fixture output. Switch to Server env to call a real model."
            : "Header Agent response received from the selected connector.",
        detail:
          typeof result?.message === "string"
            ? result.message
            : decision?.route
              ? `Output source: ${result?.source ?? llmConnector.mode} · route: ${decision.route}`
              : `Output source: ${result?.source ?? llmConnector.mode}`,
      });
    } catch (error) {
      setHeaderAgentRun({
        status: "error",
        source: llmConnector.mode,
        provider: llmConnector.mode === "server_route" ? llmConnector.provider : undefined,
        model: llmConnector.mode === "server_route" ? llmConnector.model : undefined,
        apiKeyEnv: llmConnector.mode === "server_route" ? llmConnector.apiKeyEnv : undefined,
        endpoint: llmConnector.mode === "server_route" ? llmConnector.endpoint : undefined,
        message: error instanceof Error ? error.message : "Header Agent connector failed.",
        detail: `Check ${llmConnector.apiKeyEnv} in web/.env.local, then restart the dev server.`,
      });
    }
  }

  function createTaskRoom() {
    const contract = headerAgentRun.decision ?? defaultProductResearchContract;
    const roomPlan = headerAgentRun.roomPlan ?? createRoomPlan(contract);
    const mission = createProductResearchRoom(runtimePolicy, contract, roomPlan);
    setMissions((current) => {
      const exists = current.some((item) => item.id === mission.id);
      if (exists) return current.map((item) => (item.id === mission.id ? mission : item));
      return [mission, ...current];
    });
    setRouteDialogOpen(false);
    setActiveMissionId(mission.id);
  }

  function advanceMission(mission: Mission) {
    setMissions((current) =>
      current.map((item) => {
        if (item.id !== mission.id || item.status !== "running") return item;

        if (item.phase === "Research") {
          return {
            ...item,
            phase: "Compare",
            progress: 52,
            spent: item.spent + 1.12,
            projectedNextSpend: 1.26,
            headerAutoPassed: item.headerAutoPassed + 5,
            artifacts: ["room contract", "research brief", "comparison matrix"],
            timeline: [
              ...item.timeline,
              "Research Agent 完成公开来源聚类，产出 research brief。",
              "Room Controller 判断证据覆盖达标，路由到 Product Critic Agent 生成 comparison matrix。",
              "Header Agent 将轻微产品定义分歧汇总到 Mission File，没有打断用户。",
            ],
          };
        }

        if (item.phase === "Compare") {
          return {
            ...item,
            status: "needs_review",
            phase: "Review",
            progress: 68,
            spent: item.spent + 1.08,
            projectedNextSpend: 1.44,
            headerSummarized: item.headerSummarized + 1,
            artifacts: ["room contract", "research brief", "comparison matrix", "budget delta"],
            timeline: [
              ...item.timeline,
              "Room Controller 检测到 Product Critic 与 Collaboration Designer 的判断冲突，需要 stronger synthesis。",
              "下一步若加强审查可提高完成概率，但会触达预算边界。",
              "Header Agent 判断预算/成功率权衡必须升级给用户确认。",
            ],
          };
        }

        if (item.phase === "Merge") {
          return {
            ...item,
            status: "done",
            phase: "Result",
            progress: 100,
            spent: item.spent + 0.84,
            projectedNextSpend: 0,
            artifacts: [
              "room contract",
              "research brief",
              "comparison matrix",
              "conflict log",
              "final recommendation",
            ],
            timeline: [
              ...item.timeline,
              "Merge Agent 合并 Product Critic 的反例和 Collaboration Designer 的介入点。",
              "QA Agent 检查 artifact contract，确认结果达到 decision-grade。",
              "Header Agent 压缩结果，保留 evidence、unknowns、runtime summary 和 reusable Skill draft。",
            ],
            result:
              "推荐把 demo 定位为 agent-native work layer：Slack / 飞书以消息为中心，新平台以 mission 为中心；Header Agent 管理个人协作边界，Task Room 负责探索能力缺口下的最小可行 Agent Team，并把人类反馈沉淀为可复用能力。",
          };
        }

        return item;
      }),
    );
  }

  function approveHeaderGate(mission: Mission) {
    setMissions((current) =>
      current.map((item) =>
        item.id === mission.id
          ? {
              ...item,
              status: "running",
              phase: "Merge",
              progress: 78,
              budgetCap: item.budgetCap + 2,
              spent: item.spent + 0.32,
              projectedNextSpend: 0.84,
              timeline: [
                ...item.timeline,
                `用户确认为了提高完成概率，将预算边界提高到 ${formatMoney(item.budgetCap + 2)}，Header Agent 恢复 Task Room。`,
              ],
            }
          : item,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-zinc-950">
      <section className="mx-auto flex w-full max-w-[1380px] flex-col gap-4 px-4 py-4 lg:px-6">
        {activeMission ? (
          <MissionDetail
            mission={activeMission}
            runtimePolicy={runtimePolicy}
            onBack={() => setActiveMissionId(null)}
            onAdvance={() => advanceMission(activeMission)}
            onApproveHeaderGate={() => approveHeaderGate(activeMission)}
            onOpenEval={() => setEvalDialogOpen(true)}
          />
        ) : (
          <>
            <LegacyPrototypeBanner />
            <HeaderCommand
              command={command}
              runtimePolicy={runtimePolicy}
              llmConnector={llmConnector}
              onCommandChange={setCommand}
              onLlmConnectorChange={setLlmConnector}
              onRoute={openRoutingDecision}
            />
            <MissionBoardHeader onOpenEval={() => setEvalDialogOpen(true)} />
            <MissionBoard missions={missions} onOpenMission={setActiveMissionId} />
          </>
        )}
      </section>

      <RoutingDecisionDialog
        open={routeDialogOpen}
        runtimePolicy={runtimePolicy}
        command={command}
        llmConnector={llmConnector}
        headerAgentRun={headerAgentRun}
        onOpenChange={setRouteDialogOpen}
        onRuntimePolicyChange={setRuntimePolicy}
        onCreateRoom={createTaskRoom}
      />
      <EvalDialog
        open={evalDialogOpen}
        onOpenChange={setEvalDialogOpen}
        selectedEval={selectedEval}
        selectedEvalId={selectedEvalId}
        onSelectEval={setSelectedEvalId}
      />
    </main>
  );
}

function HeaderCommand({
  command,
  runtimePolicy,
  llmConnector,
  onCommandChange,
  onLlmConnectorChange,
  onRoute,
}: {
  command: string;
  runtimePolicy: RuntimePolicyId;
  llmConnector: LlmConnectorConfig;
  onCommandChange: (value: string) => void;
  onLlmConnectorChange: (value: LlmConnectorConfig) => void;
  onRoute: () => void;
}) {
  return (
    <header className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-base font-semibold text-zinc-700">
        <Bot className="h-4 w-4 text-zinc-500" />
        Header Agent Command
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <textarea
          value={command}
          onChange={(event) => onCommandChange(event.target.value)}
          className="min-h-20 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-base leading-6 outline-none transition focus:border-zinc-500 focus:bg-white"
          placeholder="输入新任务，Header Agent 会判断 Skill / 单 Agent / Task Room..."
        />
        <div className="flex flex-col justify-center gap-2">
          <Button type="button" onClick={onRoute} className="h-10 rounded-lg bg-zinc-950 text-sm hover:bg-zinc-800">
            <Route className="h-4 w-4" />
            交给 Header Agent 判断
          </Button>
          <p className="text-xs leading-5 text-zinc-500">
            Header Agent 在 legacy 视图中只展示 routing / capability 判断；后续 agent execution 是 planned interaction surface。
          </p>
          <LlmConnectorPanel
            command={command}
            runtimePolicy={runtimePolicy}
            config={llmConnector}
            onChange={onLlmConnectorChange}
          />
        </div>
      </div>
    </header>
  );
}

function LlmConnectorPanel({
  command,
  runtimePolicy,
  config,
  onChange,
}: {
  command: string;
  runtimePolicy: RuntimePolicyId;
  config: LlmConnectorConfig;
  onChange: (value: LlmConnectorConfig) => void;
}) {
  const requestPreview = buildHeaderAgentRequest(command, runtimePolicy);
  const modelOptions = providerModelPresets[config.provider];
  const providerKeyEnv = providerApiKeyEnv[config.provider];
  const modeLabel: Record<LlmConnectorConfig["mode"], string> = {
    fallback: "Local fixture",
    server_route: "Server env",
  };
  const connectorSummary =
    config.mode === "fallback"
      ? "Advanced LLM connector · Local fixture"
      : `Advanced LLM connector · Server env · ${config.provider}/${config.model}`;

  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
      <summary className="cursor-pointer font-medium text-zinc-700">
        {connectorSummary}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-200 bg-white p-1">
          {(["fallback", "server_route"] as LlmConnectorConfig["mode"][]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...config, mode })}
              className={[
                "h-8 rounded-md px-2 text-xs font-medium transition",
                config.mode === mode
                  ? "bg-zinc-950 text-white"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
              ].join(" ")}
            >
              {modeLabel[mode]}
            </button>
          ))}
        </div>

        {config.mode === "server_route" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-zinc-500">Provider</span>
                <select
                  value={config.provider}
                  onChange={(event) => {
                    const provider = event.target.value as LlmConnectorConfig["provider"];
                    const model = providerModelPresets[provider][0];

                    onChange({
                      ...config,
                      provider,
                      model,
                      apiKeyEnv: resolveApiKeyEnv(provider, model),
                    });
                  }}
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 outline-none"
                >
                  <option value="deepseek">DeepSeek</option>
                  <option value="kimi">Kimi / Moonshot</option>
                  <option value="minimax">MiniMax</option>
                  <option value="glm">GLM / Zhipu</option>
                  <option value="custom">Custom</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-zinc-500">Model</span>
                <input
                  value={config.model}
                  list={`model-presets-${config.provider}`}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      model: event.target.value,
                      apiKeyEnv: resolveApiKeyEnv(config.provider, event.target.value),
                    })
                  }
                  placeholder={modelOptions[0]}
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 outline-none"
                />
                <datalist id={`model-presets-${config.provider}`}>
                  {modelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
            </div>

            <div className="grid gap-2">
              <label className="block space-y-1">
                <span className="text-zinc-500">Frontend route</span>
                <input
                  value={config.endpoint}
                  onChange={(event) => onChange({ ...config, endpoint: event.target.value })}
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 outline-none"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-zinc-500">Provider endpoint override</span>
                <input
                  value={config.providerEndpoint}
                  onChange={(event) =>
                    onChange({ ...config, providerEndpoint: event.target.value })
                  }
                  placeholder="optional, required for custom providers"
                  className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 outline-none"
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-zinc-500">Server env var name</span>
              <input
                value={config.apiKeyEnv}
                onChange={(event) => onChange({ ...config, apiKeyEnv: event.target.value })}
                placeholder={providerKeyEnv}
                className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 outline-none"
              />
            </label>
          </>
        ) : (
          <div className="rounded-md bg-white p-2 leading-5 text-zinc-500">
            Local fixture uses fixed demo data. No provider, model, or API key is used in this mode.
          </div>
        )}

        <div className="rounded-md bg-white p-2 leading-5 text-zinc-500">
          Request: {requestPreview.expectedSchema} · {requestPreview.runtimePolicy}
          <br />
          Active:{" "}
          {config.mode === "fallback"
            ? "Local fixture"
            : `${modeLabel[config.mode]} · ${config.provider} / ${config.model}`}
          <br />
          Key: {config.mode === "fallback" ? "not used" : config.apiKeyEnv}
        </div>
      </div>
    </details>
  );
}

function LegacyPrototypeBanner() {
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-3.5 w-3.5" />
            Legacy visual prototype
          </div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">
            Task Room interaction surface, not trusted runtime execution
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-950">
            This view demonstrates the Task Room collaboration model: contracts, planned artifacts,
            conflict handling, human checkpoints, and feedback patches. Runtime execution, unified
            registry, and trust certification belong in the separate /workbench-v2 slice.
          </p>
          <p className="mt-2 text-sm leading-6 text-amber-950">
            Registry means discoverable, not trusted. Trust is earned by eval and human promotion.
          </p>
        </div>
        <a
          href="/workbench-v2"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-amber-300 bg-white px-3 text-sm font-medium text-amber-950 transition hover:border-amber-500 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2"
        >
          Planned trusted execution slice
          <ArrowRight className="ml-2 h-4 w-4" />
        </a>
      </div>
      <ExecutionTruthTable compact />
    </section>
  );
}

function ExecutionTruthTable({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "mt-4" : ""}>
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="grid grid-cols-[150px_160px_minmax(0,1fr)] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
          <span>Layer</span>
          <span>Status</span>
          <span>What it means</span>
        </div>
        {legacyTruthRows.map((row) => (
          <div
            key={row.layer}
            className="grid grid-cols-[150px_160px_minmax(0,1fr)] border-b border-zinc-100 px-3 py-2 text-xs leading-5 text-zinc-600 last:border-b-0"
          >
            <span className="font-medium text-zinc-800">{row.layer}</span>
            <span>{row.status}</span>
            <span>{row.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MissionBoardHeader({ onOpenEval }: { onOpenEval: () => void }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Agent Mission Board</h1>
          <p className="mt-2 text-sm leading-5 text-zinc-500">
            首页展示 Task Room 的计划态协作界面。点击任务后，查看 Header Agent 如何识别能力缺口、Controller 如何规划 artifacts、人在哪里审。
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onOpenEval} className="h-9 rounded-lg border-zinc-300 bg-white text-sm">
          <Inbox className="h-4 w-4" />
          Header Gate filters capability loops
        </Button>
      </div>
    </section>
  );
}

function MissionBoard({
  missions,
  onOpenMission,
}: {
  missions: Mission[];
  onOpenMission: (id: string) => void;
}) {
  const columns = [
    {
      id: "needs_review",
      title: "Needs Review",
      hint: "Header Agent 判断必须打断人",
      missions: missions.filter((mission) => mission.status === "needs_review"),
    },
    {
      id: "running",
      title: "Running",
      hint: "Legacy prototype simulates progress",
      missions: missions.filter((mission) => mission.status === "running"),
    },
    {
      id: "paused",
      title: "Paused",
      hint: "等待用户或外部条件",
      missions: missions.filter((mission) => mission.status === "paused"),
    },
    {
      id: "done",
      title: "Done",
      hint: "结果已交付",
      missions: missions.filter((mission) => mission.status === "done"),
    },
  ];

  return (
    <section className="grid gap-4 lg:grid-cols-4">
      {columns.map((column) => (
        <div
          key={column.id}
          className="min-h-[390px] rounded-xl border border-zinc-200 bg-white p-3 shadow-sm"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{column.title}</h2>
              <p className="mt-1 text-xs text-zinc-500">{column.hint}</p>
            </div>
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
              {column.missions.length}
            </span>
          </div>

          <div className="space-y-3">
            {column.missions.length === 0 ? (
              <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-sm text-zinc-400">
                No missions
              </div>
            ) : (
              column.missions.map((mission) => (
                <MissionCard
                  key={mission.id}
                  mission={mission}
                  onOpen={() => onOpenMission(mission.id)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </section>
  );
}

function MissionCard({ mission, onOpen }: { mission: Mission; onOpen: () => void }) {
  const routeMeta = routeTypeMeta[mission.routeType];

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{mission.title}</h3>
            <RouteBadge routeType={mission.routeType} />
          </div>
          <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-zinc-500">{mission.goal}</p>
        </div>
        <StatusBadge status={mission.status} />
      </div>

      <div className="mt-4 space-y-2">
        <Progress value={mission.progress} className="h-1 bg-zinc-100" />
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{mission.phase} phase</span>
          <span>{mission.progress}%</span>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-600">
        <div className="grid grid-cols-[92px_1fr] gap-1.5">
          <span>Header Gate</span>
          <span>
            {mission.headerAutoPassed} auto-pass · {mission.headerSummarized} summary
          </span>
          <span>Route</span>
          <span className="text-right">{routeMeta.label}</span>
          <span>Boundary left</span>
          <span className="text-right">{formatMoney(remainingBudget(mission))} left</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm font-medium text-zinc-700">
        <span>{mission.artifacts.length} artifacts</span>
        <span className="inline-flex items-center gap-2">
          Open
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </button>
  );
}

function MissionDetail({
  mission,
  runtimePolicy,
  onBack,
  onAdvance,
  onApproveHeaderGate,
  onOpenEval,
}: {
  mission: Mission;
  runtimePolicy: RuntimePolicyId;
  onBack: () => void;
  onAdvance: () => void;
  onApproveHeaderGate: () => void;
  onOpenEval: () => void;
}) {
  const routeMeta = routeTypeMeta[mission.routeType];
  const isTaskRoom = mission.routeType === "task_room";
  const isSkill = mission.routeType === "skill";

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
              Back to Mission Board
            </Button>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{mission.title} Mission</h1>
              <RouteBadge routeType={mission.routeType} />
              <StatusBadge status={mission.status} />
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">{mission.goal}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onOpenEval}>
              <FileJson2 className="h-4 w-4" />
              Eval Contract
            </Button>
            {mission.status === "running" ? (
              <Button type="button" onClick={onAdvance}>
                <Play className="h-4 w-4" />
                Simulate planned step
              </Button>
            ) : null}
            {mission.status === "needs_review" ? (
              <Button type="button" onClick={onApproveHeaderGate}>
                <CheckCircle2 className="h-4 w-4" />
                Approve via Header
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="rounded-xl border border-zinc-200 bg-white shadow-sm">
          <MissionSection icon={<ShieldCheck className="h-4 w-4" />} title="Header Agent Interface">
            <p>
              Header Agent 是人与 Agent、人与人之间的协作接口。它先判断当前任务应该走 Skill、
              单 Agent、Task Room 还是 Header-to-Header，并根据授权、风险和置信度决定是否打断用户。
              在 legacy 视图里，它展示的是 interaction contract，不代表完整 runtime 已执行。
            </p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <SmallFact label="Route Type" value={routeMeta.label} />
              <SmallFact label="Capability Fit" value={routeMeta.fit} />
              <SmallFact label="Execution Strategy" value={runtimePolicies[runtimePolicy].label} />
            </div>
          </MissionSection>

          <MissionSection icon={<BrainCircuit className="h-4 w-4" />} title="Runtime Success Routing">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-sm font-semibold">{runtimePolicies[runtimePolicy].label}</div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                {runtimePolicies[runtimePolicy].objective}
              </p>
              <div className="mt-3 rounded-md bg-white p-2 text-xs leading-5 text-zinc-500">
                {runtimePolicies[runtimePolicy].routingRule}
              </div>
            </div>
          </MissionSection>

          <MissionSection
            icon={<GitBranch className="h-4 w-4" />}
            title={isTaskRoom ? "Minimum Viable Agent Team" : "Execution Unit"}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {mission.agents.map((agent) => (
                <div key={agent} className="rounded-lg border border-zinc-200 p-3">
                  <div className="text-xs text-zinc-500">Planned actor</div>
                  <div className="mt-1 text-sm font-semibold">{agent}</div>
                  <div className="mt-2 text-xs leading-5 text-zinc-500">
                    {agentRoleDescriptions[agent] ?? "按当前任务临时分配的 agent role"}
                  </div>
                  <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-900">
                    Trust: declared · needs eval
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">
              {isTaskRoom
                ? "Room Controller 只规划足够完成判断的最小团队，不预设完整组织。Artifact contract: research brief -> comparison matrix -> conflict log -> decision-grade recommendation. 这里是 planned collaboration view, not executed runtime."
                : isSkill
                  ? "Header Agent 复用已有 Skill，直接执行稳定模板并返回结果，不需要组建 Task Room。"
                  : "Header Agent 委托单个 agent 完成任务，保留 artifact 和 trace，但不启动 Room Controller loop。"}
            </div>
          </MissionSection>

          {isTaskRoom ? (
            <>
              <TaskRoomCollaborationSurface />
              <MissionSection icon={<Layers3 className="h-4 w-4" />} title="Capability Loop">
                <div className="grid gap-2 md:grid-cols-7">
                  {phaseOrder.map((phase) => {
                    const phaseIndex = phaseOrder.indexOf(phase);
                    const activeIndex = phaseOrder.indexOf(mission.phase);
                    const done = phaseIndex < activeIndex || mission.status === "done";
                    const active = phase === mission.phase && mission.status !== "done";
                    return (
                      <div
                        key={phase}
                        className={[
                          "rounded-lg border p-2 text-center text-xs",
                          done
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : active
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-zinc-200 bg-zinc-50 text-zinc-500",
                        ].join(" ")}
                      >
                        {phaseLabels[phase]}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
                  Legacy mode simulates the loop state: planned steps, artifact checks, pass / retry / reroute / escalate.
                  It is meant to show where a real Controller harness would enforce the collaboration contract.
                </div>
              </MissionSection>
            </>
          ) : (
            <MissionSection icon={<Layers3 className="h-4 w-4" />} title="Execution Path">
              <div className="grid gap-2 md:grid-cols-3">
                <SmallFact label="Route" value={routeMeta.label} />
              <SmallFact
                label="Executor"
                  value={isSkill ? "Reusable Skill" : mission.agents[0] ?? "Single Agent"}
                />
                <SmallFact label="Legacy mode" value={isSkill ? "Planned skill surface" : "Planned trace"} />
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">{routeMeta.description}</p>
            </MissionSection>
          )}

          {isTaskRoom || mission.routeType === "header_to_header" ? (
            <MissionSection icon={<Users className="h-4 w-4" />} title="Header-to-Header Collaboration">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
                当任务需要另一个人 review 时，不是直接 @ 对方本人，而是由当前 Header Agent
                发给对方 Header Agent：压缩上下文、请求判断、权限边界和预计时间。对方 Header Agent 再决定是否打扰用户。
              </div>
            </MissionSection>
          ) : null}

          <MissionSection icon={<FileText className="h-4 w-4" />} title={mission.result ? "Decision-Grade Result" : "Working File"}>
            {mission.result ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                {mission.result}
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
                中间过程默认不推给用户，只保留可审计 Mission File。Legacy mode 只展示 planned artifacts；
                Room Controller 在真实 runtime 中才会执行预算、授权、重大冲突、成功率下降或最终结果的人审闸。
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {mission.artifacts.map((artifact) => (
                <Badge key={artifact} variant="outline" className="rounded-md border-zinc-300 bg-white">
                  {artifact}
                </Badge>
              ))}
            </div>
          </MissionSection>

          <MissionSection icon={<Sparkles className="h-4 w-4" />} title="Human Feedback → Capability Update">
            <div className="grid gap-3 md:grid-cols-3">
              <SmallFact label="Accept" value="结果进入用户工作流" />
              <SmallFact label="Patch" value="Header Agent 转译反馈" />
              <SmallFact label="Save" value="沉淀 Skill / Contract" />
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              {isTaskRoom
                ? "Task Room 的产出不是一次性答案。大多数反馈不会直接修改 contract template，而是由 Header Agent 转成 instruction patch，交给 Room Controller 更新当前 run state。Legacy mode 只展示 patch preview；多次真实验证有效的 patch 才会沉淀为新的 contract version。"
                : "任务结果会回写 Header Agent 的偏好和能力记忆：稳定结果可以沉淀为 Skill，不稳定任务下次可升级为 Task Room。"}
            </p>
            {isTaskRoom ? (
              <details className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                  Feedback Patch Protocol
                </summary>
                <div className="mt-3 grid gap-2 md:grid-cols-4">
                  <SmallFact label="User" value="给 Header Agent 反馈" />
                  <SmallFact label="Header" value="解释意图与边界" />
                  <SmallFact label="Controller" value="patch run state" />
                  <SmallFact label="Agents" value="重跑受影响步骤" />
                </div>
                <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
                  {JSON.stringify(exampleFeedbackPatch, null, 2)}
                </pre>
              </details>
            ) : null}
          </MissionSection>

          <MissionSection icon={<FileJson2 className="h-4 w-4" />} title="Trace Summary">
            <ol className="space-y-2">
              {mission.timeline.map((item) => (
                <li key={item} className="flex gap-3 text-sm leading-6 text-zinc-600">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </MissionSection>
        </article>

        <HeaderGatePanel mission={mission} />
      </div>
    </section>
  );
}

function HeaderGatePanel({ mission }: { mission: Mission }) {
  const remaining = remainingBudget(mission);

  return (
    <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-3 shadow-sm lg:sticky lg:top-4">
      <div className="flex items-center gap-2">
        <LockKeyhole className="h-4 w-4 text-zinc-500" />
        <h2 className="text-base font-semibold">Header Gate</h2>
      </div>

      {mission.status === "needs_review" ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <h3 className="text-sm font-semibold text-amber-950">Needs human decision</h3>
              <p className="mt-2 text-sm leading-6 text-amber-900">
                下一步预计 {formatMoney(mission.projectedNextSpend)}，剩余额度 {formatMoney(remaining)}。
                Header Agent 判断继续提升完成概率需要新的预算或授权确认。
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <h3 className="text-sm font-semibold">
            {mission.status === "done" ? "Capability updated" : "No user interruption"}
          </h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {mission.headerAutoPassed} events auto-passed · {mission.headerSummarized} summarized.
          </p>
        </div>
      )}

      <div className="mt-3 space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Boundary usage</span>
            <span>
              {formatMoney(mission.spent)} / {formatMoney(mission.budgetCap)}
            </span>
          </div>
          <Progress value={(mission.spent / mission.budgetCap) * 100} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SmallFact label="Remaining" value={formatMoney(remaining)} />
          <SmallFact label="Next step" value={formatMoney(mission.projectedNextSpend)} />
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-200 p-3">
        <h3 className="text-sm font-semibold">Escalation policy</h3>
        <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-600">
          <li>Auto-pass: artifact handoff, formatting, public-source checks.</li>
          <li>Summarize: low-impact scope adjustment, minor disagreement.</li>
          <li>Reroute: artifact quality miss, weak evidence, low completion probability.</li>
          <li>Escalate: budget boundary, new authority, major conflict, final result.</li>
          <li>Header-to-Header: peer review request with compressed context.</li>
        </ul>
      </div>

      {mission.status === "done" ? (
        <div className="mt-3 grid gap-2">
          <Button type="button">
            <CheckCircle2 className="h-4 w-4" />
            Accept Result
          </Button>
          <Button type="button" variant="outline">
            <ArrowRight className="h-4 w-4" />
            Request Revision
          </Button>
          <Button type="button" variant="outline">
            <Sparkles className="h-4 w-4" />
            Save Skill / Contract
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function TaskRoomCollaborationSurface() {
  return (
    <MissionSection icon={<FileJson2 className="h-4 w-4" />} title="Artifact-First Task Room">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
        Planned / not executed in legacy mode. This section shows how a Task Room should coordinate
        declared agents through artifacts, conflicts, merge rules, and human checkpoints.
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {taskRoomArtifactContracts.map((item) => (
          <div key={item.title} className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="text-sm font-semibold text-zinc-900">{item.title}</div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{item.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-sm font-semibold text-zinc-900">Conflict / Merge Preview</div>
          <ul className="mt-2 space-y-2 text-xs leading-5 text-zinc-600">
            <li>Product Critic may reject over-broad positioning claims.</li>
            <li>Collaboration Designer may propose a larger protocol than the evidence supports.</li>
            <li>Controller merge rule keeps unsupported claims in unresolved risk, not final recommendation.</li>
          </ul>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-sm font-semibold text-zinc-900">Human Checkpoints</div>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-600">
            {humanCheckpointItems.map((item) => (
              <li key={item}>• {item}</li>
            ))}
          </ul>
        </div>
      </div>
    </MissionSection>
  );
}

function RoutingDecisionDialog({
  open,
  runtimePolicy,
  command,
  llmConnector,
  headerAgentRun,
  onOpenChange,
  onRuntimePolicyChange,
  onCreateRoom,
}: {
  open: boolean;
  runtimePolicy: RuntimePolicyId;
  command: string;
  llmConnector: LlmConnectorConfig;
  headerAgentRun: HeaderAgentRunState;
  onOpenChange: (open: boolean) => void;
  onRuntimePolicyChange: (value: RuntimePolicyId) => void;
  onCreateRoom: () => void;
}) {
  const policy = runtimePolicies[runtimePolicy];
  const requestPreview = buildHeaderAgentRequest(command, runtimePolicy);
  const liveDecision = headerAgentRun.decision;
  const routerCheck = headerAgentRun.routerCheck;
  const roomPlan = headerAgentRun.roomPlan ?? (liveDecision ? createRoomPlan(liveDecision) : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] grid-rows-[auto_minmax(0,1fr)] p-0 sm:max-w-3xl">
        <DialogHeader className="px-4 pt-4 pr-12">
          <DialogTitle>Header Agent Routing Decision</DialogTitle>
          <DialogDescription>
            Header Agent 识别能力缺口；legacy view 只创建 planned Task Room interaction surface。
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-4 pb-4">
          <div
            className={[
              "rounded-lg border p-3 text-sm",
              headerAgentRun.status === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : headerAgentRun.status === "running"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700",
            ].join(" ")}
          >
            <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2 font-semibold">
                {headerAgentRun.status === "error" ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <BrainCircuit className="h-4 w-4" />
                )}
                Header Agent run: {headerAgentRun.status}
              </div>
              <div className="text-xs">
                {headerAgentRun.source === "fallback"
                  ? "local fixture"
                  : "server route"}
              </div>
            </div>
            <p className="mt-2 leading-6">{headerAgentRun.message}</p>
          {headerAgentRun.detail ? (
            <p className="mt-1 text-xs leading-5 opacity-80">{headerAgentRun.detail}</p>
          ) : null}
          </div>

          <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs leading-5 text-zinc-600">
                <div className="font-semibold text-zinc-900">
                  {roomPlan?.status === "ready" ? "Ready to open Task Room" : "Review routing decision"}
                </div>
                <div>
                  {routerCheck
                    ? `Router Check: ${routerCheck.status}`
                    : `Header Agent run: ${headerAgentRun.status}`}
                  {roomPlan?.agents.length ? ` · ${roomPlan.agents.length} planned actors` : ""}
                </div>
              </div>
              <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onCreateRoom}
                  disabled={headerAgentRun.status === "running" || headerAgentRun.status === "error"}
                >
                  Open planned Task Room
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_270px]">
          <div className="space-y-3">
            {liveDecision ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
                  <FileJson2 className="h-4 w-4 text-emerald-700" />
                  Header Decision Contract
                </div>
                <div className="mt-3 grid gap-2 text-xs text-emerald-950 sm:grid-cols-3">
                  <div className="rounded-md bg-white/80 p-2">
                    <div className="text-emerald-700">Route</div>
                    <div className="mt-1 font-semibold">{liveDecision.route ?? "not returned"}</div>
                  </div>
                  <div className="rounded-md bg-white/80 p-2">
                    <div className="text-emerald-700">Confidence</div>
                    <div className="mt-1 font-semibold">
                      {typeof liveDecision.confidence === "number"
                        ? `${Math.round(liveDecision.confidence * 100)}%`
                        : "not returned"}
                    </div>
                  </div>
                  <div className="rounded-md bg-white/80 p-2">
                    <div className="text-emerald-700">Task Room</div>
                    <div className="mt-1 font-semibold">
                      {liveDecision.needs_task_room === undefined
                        ? "not returned"
                        : liveDecision.needs_task_room
                          ? "needed"
                          : "not needed"}
                    </div>
                  </div>
                </div>
                {liveDecision.gap_reason ? (
                  <p className="mt-3 text-xs leading-5 text-emerald-900">
                    Gap: {liveDecision.gap_reason}
                  </p>
                ) : null}
                {roomPlan?.coverage.length ? (
                  <p className="mt-2 text-xs leading-5 text-emerald-900">
                    Required capabilities: {roomPlan.coverage.map((item) => item.capability).join(" -> ")}
                  </p>
                ) : null}
                {liveDecision.artifact_contract?.length ? (
                  <p className="mt-2 text-xs leading-5 text-emerald-900">
                    Artifact contract: {liveDecision.artifact_contract.join(" -> ")}
                  </p>
                ) : null}
              </div>
            ) : null}
            {routerCheck ? (
              <div className="rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="h-4 w-4 text-zinc-500" />
                  Router Check: {routerCheck.status}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-zinc-600">
                  {routerCheck.checks.map((check) => (
                    <div key={check.id} className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5">
                      <span>{check.label}</span>
                      <span className={check.passed ? "text-emerald-700" : "text-red-700"}>
                        {check.passed ? "pass" : "review"}
                      </span>
                    </div>
                  ))}
                </div>
                {routerCheck.override_reason ? (
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    Override: {routerCheck.override_reason}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="rounded-lg border border-zinc-200 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Route className="h-4 w-4 text-zinc-500" />
                Route: Capability Gap → Task Room
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Header Agent 判断是否需要 Task Room，并输出 capability gap、artifact contract 和 approval boundary。
                Concrete agent execution is not run in this legacy view.
              </p>
            </div>
            {roomPlan ? (
              <div className="rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users className="h-4 w-4 text-zinc-500" />
                  Room Controller Plan
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {roomPlan.agents.length
                    ? roomPlan.agents.join(" -> ")
                    : "Task Room is not required for this route."}
                </p>
                {roomPlan.plan_checks?.length ? (
                  <div className="mt-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-2">
                    {roomPlan.plan_checks.map((check) => (
                      <div key={check.id} className="flex items-center justify-between rounded-md bg-zinc-50 px-2 py-1.5">
                        <span>{check.label}</span>
                        <span className={check.passed ? "text-emerald-700" : "text-red-700"}>
                          {check.passed ? "pass" : "review"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                {roomPlan.coverage.length ? (
                  <div className="mt-3 grid gap-2 text-xs text-zinc-600 md:grid-cols-2">
                    {roomPlan.coverage.map((item) => (
                      <div key={item.capability} className="rounded-md bg-zinc-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-zinc-800">{item.label}</div>
                          <div className="text-emerald-700">
                            {typeof item.coverage_score === "number"
                              ? `${Math.round(item.coverage_score * 100)}%`
                              : item.covered
                                ? "covered"
                                : "review"}
                          </div>
                        </div>
                        <div className="mt-1 text-zinc-500">
                          {item.agent} · {item.source}
                          {item.candidate_agents?.length ? ` · ${item.candidate_agents.length} candidates` : ""}
                        </div>
                        <div className="mt-1 text-amber-700">
                          coverage heuristic · not verified reliability
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {roomPlan.reliability_notes?.length ? (
                  <p className="mt-2 text-xs leading-5 text-zinc-500">
                    {roomPlan.reliability_notes.join(" ")}
                  </p>
                ) : null}
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  In a real runtime, Controller would enforce artifact quality and decide pass / retry / reroute / escalate.
                  Here it is a frontend planning prototype.
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <BrainCircuit className="h-4 w-4 text-zinc-500" />
              Execution Strategy
            </div>
            <div className="mt-3 grid gap-2">
              {(Object.keys(runtimePolicies) as RuntimePolicyId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onRuntimePolicyChange(id)}
                  className={[
                    "rounded-lg border px-3 py-2 text-left text-xs transition",
                    runtimePolicy === id
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
                  ].join(" ")}
                >
                  <div className="font-semibold">{runtimePolicies[id].label}</div>
                  <div className={runtimePolicy === id ? "mt-1 text-zinc-300" : "mt-1 text-zinc-500"}>
                    {formatMoney(runtimePolicies[id].budget)} boundary
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">{policy.description}</p>
            <div className="mt-3 rounded-md bg-white p-2 text-xs leading-5 text-zinc-500">
              Objective: {policy.objective}
              <br />
              Routing: {policy.routingRule}
            </div>
            <div className="mt-3 rounded-md bg-white p-2 text-xs leading-5 text-zinc-500">
              LLM connector: {llmConnector.mode}
              <br />
              Endpoint: {llmConnector.endpoint}
              <br />
              Output: {requestPreview.expectedSchema}
            </div>
          </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}

function EvalDialog({
  open,
  onOpenChange,
  selectedEval,
  selectedEvalId,
  onSelectEval,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedEval: EvalCase;
  selectedEvalId?: string;
  onSelectEval: (id: string) => void;
}) {
  const result = evaluateDecision(selectedEval);
  const passCount = agentWorkbenchEvalCases.filter((item) => evaluateDecision(item).passed).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Header Agent Eval Contract</DialogTitle>
          <DialogDescription>
            Routing eval only: this checks HeaderAgentDecision structure, not agent output quality or runtime execution.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Badge variant="outline" className="mb-2 rounded-md border-emerald-300 bg-emerald-50 text-emerald-900">
              {passCount} / {agentWorkbenchEvalCases.length} routing cases pass
            </Badge>
            {agentWorkbenchEvalCases.map((item) => {
              const itemResult = evaluateDecision(item);
              return (
                <button
                  key={item.case_id}
                  type="button"
                  onClick={() => onSelectEval(item.case_id)}
                  className={[
                    "w-full rounded-lg border p-3 text-left transition hover:border-zinc-400",
                    selectedEvalId === item.case_id ? "border-zinc-900" : "border-zinc-200",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{item.name}</span>
                    <span
                      className={[
                        "rounded-md px-2 py-1 text-xs",
                        itemResult.passed
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-red-50 text-red-700",
                      ].join(" ")}
                    >
                      {itemResult.passed ? "PASS" : "FAIL"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{item.category}</div>
                </button>
              );
            })}
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div>
                <h3 className="text-base font-semibold">{selectedEval.name}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{selectedEval.input}</p>
              </div>
              <Badge
                variant="outline"
                className={
                  result.passed
                    ? "rounded-md border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "rounded-md border-red-300 bg-red-50 text-red-700"
                }
              >
                {result.passed ? "PASS" : "FAIL"}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <SmallFact label="Route" value={selectedEval.simulated_output.route} />
              <SmallFact label="Runtime" value={selectedEval.simulated_output.runtime_policy} />
              <SmallFact
                label="Budget"
                value={
                  selectedEval.simulated_output.budget_required
                    ? `${formatMoney(selectedEval.simulated_output.budget_cap_suggestion ?? 0)} cap`
                    : "not required"
                }
              />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <EvalList title="Artifact Contract" items={selectedEval.simulated_output.artifact_contract} />
              <EvalList title="Needs Approval" items={selectedEval.simulated_output.needs_approval} />
              <EvalList title="Blocked Actions" items={selectedEval.simulated_output.blocked_actions} />
              <EvalList title="Evaluation Notes" items={selectedEval.simulated_output.evaluation_notes} />
            </div>

            <details className="mt-4 rounded-lg border border-zinc-200 bg-white p-3">
              <summary className="cursor-pointer text-sm font-semibold">Structured output shape</summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
                {JSON.stringify(evalData.output_contract.schema, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MissionSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-zinc-200 p-4 last:border-b-0">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="text-sm leading-6 text-zinc-600">{children}</div>
    </section>
  );
}

function SmallFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function RouteBadge({ routeType }: { routeType: MissionRouteType }) {
  const meta = routeTypeMeta[routeType];

  return (
    <Badge variant="outline" className={`rounded-md ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

function EvalList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-600">
        {items.map((item) => (
          <li key={item}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: MissionStatus }) {
  if (status === "needs_review") {
    return (
      <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
        Review
      </Badge>
    );
  }
  if (status === "paused") {
    return (
      <Badge variant="outline" className="border-zinc-300 bg-zinc-100 text-zinc-700">
        Paused
      </Badge>
    );
  }
  if (status === "done") {
    return (
      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900">
        Done
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-900">
      Running
    </Badge>
  );
}
