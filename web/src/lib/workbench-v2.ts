import { readFile } from "node:fs/promises";
import path from "node:path";

export type TrustTier =
  | "deterministic"
  | "verified"
  | "declared"
  | "provisional"
  | "excluded_by_design";

export type ExecutionMode = "real" | "live_llm" | "deterministic" | "planned" | "simulated";

export type RegistryUnit = {
  id: string;
  label: string;
  type: "skill" | "agent";
  capabilities: string[];
  trust_tier: TrustTier;
  trust_evidence: string;
  verified_scope: string[];
  execution_mode: ExecutionMode;
  blocked_actions: string[];
  human_checkpoint_policy: string;
  memory_writeback_policy: string;
};

export type ArtifactContractDefinition = {
  contract_version: string;
  required_fields: string[];
  optional_fields: string[];
  handoff_rule: string;
};

export type WorkbenchRegistry = {
  version: string;
  trust_model: {
    principle: string;
    tiers?: Record<string, string>;
    propagation_rule?: string[];
  };
  artifact_contract: ArtifactContractDefinition;
  capabilities: {
    id: string;
    label: string;
    description: string;
  }[];
  skills: RegistryUnit[];
  agents: RegistryUnit[];
};

export type HeaderDecision = {
  route:
    | "direct_answer"
    | "skill"
    | "single_agent"
    | "task_room"
    | "header_gate_escalation";
  execution_required: boolean;
  required_capabilities: string[];
  constraints: string[];
  unknowns: string[];
  approval_boundary: string[];
  blocked_actions: string[];
  direct_answer: string | null;
};

export type ControllerPlan = {
  source: "deterministic";
  resolved_runtime:
    | "direct_answer"
    | "verified_skill"
    | "declared_agent"
    | "task_room_plan"
    | "validated_gap";
  selected_unit: string | null;
  trust_tier: TrustTier | null;
  execution_mode: ExecutionMode | "none";
  room_required: boolean;
  human_checkpoints: string[];
  trust_warnings: string[];
  selected_unit_detail?: RegistryUnit;
};

export type CertificationCase = {
  case_id: string;
  title: string;
  input: string;
  expected_findings: string[];
  required_terms: string[];
  forbidden_recommendations: string[];
};

export type ProductCriticArtifact = {
  risks: string[];
  counterarguments: string[];
  recommendation: string;
  human_review_questions: string[];
};

export type ProductCriticCaseResult = {
  execution_source: "live_llm";
  provider: "deepseek";
  agent_id: "product_critic_agent";
  case_id: string;
  artifact: ProductCriticArtifact;
};

export type ScoredCase = ProductCriticCaseResult & {
  deterministic_score: {
    passed: boolean;
    missing_terms: string[];
    forbidden_hits: string[];
    required_fields_present: boolean;
  };
};

export type OpenAiCompatibleUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type RouteExplanation = {
  room_decision: "do_not_open_room" | "open_room";
  headline: string;
  reasons: string[];
  blocked_actions: string[];
  excluded_agents: {
    id: string;
    label: string;
    trust_tier: TrustTier;
    reason: string;
    blocked_actions: string[];
  }[];
  decision_basis_fields: string[];
};

export type ArtifactContractCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export type ProductResearchArtifact = {
  artifact_id: string;
  producer_agent: string;
  contract_version: string;
  judgment: string;
  evidence: string[];
  confidence: number;
  blocked_actions: string[];
  missing_information: string[];
  risk_register: string[];
};

export type ArtifactHandoffResponse = {
  execution_source: "live_llm";
  provider: "kimi";
  model: string;
  usage: OpenAiCompatibleUsage | null;
  task: string;
  agents: {
    producer: RegistryUnit;
    consumer: RegistryUnit;
  };
  artifact_contract: ArtifactContractDefinition;
  artifact: ProductResearchArtifact;
  producer_trace: {
    system_prompt: string;
    user_prompt: string;
    raw_response: string;
    usage: OpenAiCompatibleUsage | null;
  };
  defect_injection: {
    enabled: boolean;
    field: string | null;
    rationale: string;
  };
  validation: {
    status: "passed" | "failed";
    missing_fields: string[];
    checks: ArtifactContractCheck[];
    action: "proceed" | "degrade_to_human_review" | "send_back";
  };
  downstream_input_packet: {
    consumer_agent: string;
    included_fields: Record<string, unknown>;
    excluded_context: string[];
    missing_fields: string[];
  };
  downstream_decision: {
    evaluator: "deterministic_gate";
    evaluator_note: string;
    rule: string;
    decision: "Go" | "Review" | "No-go";
    consistent_basis_fields: string[];
    confidence: number;
    note: string;
  };
};

export type ProtocolComparisonRow = {
  mode: "raw_trace" | "compressed_state";
  label: string;
  tokens: number;
  prompt_tokens: number | null;
  payload_chars: number;
  downstream_decision: "Go" | "Review" | "No-go";
  decision_basis_fields: string[];
  payload_summary: string;
};

export type ProtocolComparisonResponse = {
  execution_source: "live_llm";
  provider: "kimi";
  model: string;
  usage: {
    raw_trace: OpenAiCompatibleUsage | null;
    compressed_state: OpenAiCompatibleUsage | null;
  };
  task: string;
  room_case: string;
  rows: ProtocolComparisonRow[];
  token_savings: {
    raw_trace_tokens: number;
    compressed_state_tokens: number;
    /** 可能为负：压缩反而更贵时如实呈现，不 floor 到 0。 */
    saved_tokens: number;
    saved_percent: number;
    measured: boolean;
    measurement_note: string;
  };
  decision_consistent: boolean;
  basis_identical: boolean;
  shared_basis_fields: string[];
  /** 结论随实测走：一致 / 不一致 是两种不同的真结果，都要能展示。 */
  verdict: {
    status: "consistent" | "divergent";
    headline: string;
    detail: string;
  };
  trace_source: "beat2_real_producer_trace" | "regenerated_producer_trace";
  playbook_preview: {
    title: string;
    should_writeback: boolean;
    blocked_reason: string | null;
    next_run_rule: string;
    reuse_benefit: string;
  };
};

const repoRoot = path.resolve(process.cwd(), "..");

export function repoPath(...parts: string[]) {
  return path.join(repoRoot, ...parts);
}

export async function readJsonFile<T>(...parts: string[]) {
  const raw = await readFile(repoPath(...parts), "utf-8");
  return JSON.parse(raw) as T;
}

export async function readWorkbenchRegistry() {
  return readJsonFile<WorkbenchRegistry>("data", "workbench_registry.json");
}

export async function readCertificationCases() {
  return readJsonFile<{ version: string; agent_id: string; purpose: string; cases: CertificationCase[] }>(
    "data",
    "product_critic_certification_cases.json",
  );
}

export async function readProductResearchTask() {
  const raw = await readFile(repoPath("artifacts", "product_research_collaboration_tools_v1.md"), "utf-8");
  return raw;
}

export function parseJsonText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("模型没有返回 JSON。");
    return JSON.parse(fenced.slice(start, end + 1));
  }
}

export async function callOpenAiCompatibleJson({
  endpoint,
  apiKey,
  model,
  temperature = 0.2,
  system,
  user,
  label = "llm",
}: {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature?: number;
  system: string;
  user: string;
  label?: string;
}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `${label} 模型服务请求失败: ${response.status}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) {
    const keys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
    const finishReason = payload?.choices?.[0]?.finish_reason;
    throw new Error(
      `${label} 模型服务响应没有 message content。status=${response.status}; keys=${keys || "none"}; finish_reason=${finishReason ?? "none"}`,
    );
  }
  return parseJsonText(text);
}

export async function callOpenAiCompatibleJsonWithMeta<T>({
  endpoint,
  apiKey,
  model,
  temperature = 0.2,
  system,
  user,
  label = "llm",
}: {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature?: number;
  system: string;
  user: string;
  label?: string;
}): Promise<{ data: T; usage: OpenAiCompatibleUsage | null; raw_text: string }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    error?: { message?: string };
    usage?: OpenAiCompatibleUsage;
  };

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `${label} 模型服务请求失败: ${response.status}`);
  }
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) {
    const keys = payload && typeof payload === "object" ? Object.keys(payload).join(", ") : typeof payload;
    const finishReason = payload?.choices?.[0]?.finish_reason;
    throw new Error(
      `${label} 模型服务响应没有 message content。status=${response.status}; keys=${keys || "none"}; finish_reason=${finishReason ?? "none"}`,
    );
  }

  return {
    data: parseJsonText(text) as T,
    usage: payload.usage ?? null,
    raw_text: text,
  };
}

export function normalizeHeaderDecision(raw: Record<string, unknown>): HeaderDecision {
  const route = typeof raw.route === "string" ? raw.route : "header_gate_escalation";
  const allowedRoutes = [
    "direct_answer",
    "skill",
    "single_agent",
    "task_room",
    "header_gate_escalation",
  ];

  return {
    route: allowedRoutes.includes(route) ? (route as HeaderDecision["route"]) : "header_gate_escalation",
    execution_required:
      typeof raw.execution_required === "boolean" ? raw.execution_required : route !== "direct_answer",
    required_capabilities: asStringArray(raw.required_capabilities),
    constraints: asStringArray(raw.constraints),
    unknowns: asStringArray(raw.unknowns),
    approval_boundary: asStringArray(raw.approval_boundary),
    blocked_actions: asStringArray(raw.blocked_actions),
    direct_answer: typeof raw.direct_answer === "string" ? raw.direct_answer : null,
  };
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function inferFallbackDecision(task: string): HeaderDecision {
  const text = task.toLowerCase();
  if (/boss|岗位|jd|job|职位|求职/.test(text)) {
    return {
      route: "skill",
      execution_required: true,
      required_capabilities: ["job_fit_scoring"],
      constraints: ["只使用 sample source", "不自动投递", "不联系招聘方"],
      unknowns: [],
      approval_boundary: ["外部投递", "简历改写", "memory 写回"],
      blocked_actions: ["auto_apply", "contact_recruiter", "invent_resume_experience"],
      direct_answer: null,
    };
  }
  if (/critic|批判|过度|over-agent|信任|trust|result-first|证据/.test(text)) {
    return {
      route: "single_agent",
      execution_required: true,
      required_capabilities: ["product_critique"],
      constraints: ["scoped verification 前必须先通过 certification"],
      unknowns: [],
      approval_boundary: ["agent 晋升", "memory 写回"],
      blocked_actions: ["claim_verified_without_eval"],
      direct_answer: null,
    };
  }
  if (/research|产品|发布|launch|room|协作|竞品/.test(text)) {
    return {
      route: "task_room",
      execution_required: true,
      required_capabilities: ["task_room_planning", "product_critique"],
      constraints: ["仅展示 planned view", "不执行 multi-agent room"],
      unknowns: ["agent 输出质量尚未认证"],
      approval_boundary: ["最终建议", "外部动作", "memory 写回"],
      blocked_actions: ["claim_task_room_executed"],
      direct_answer: null,
    };
  }
  return {
    route: "direct_answer",
    execution_required: false,
    required_capabilities: [],
    constraints: [],
    unknowns: [],
    approval_boundary: [],
    blocked_actions: [],
    direct_answer: "这个问题可以由 Header Agent 直接回答，不需要进入 Controller 执行。",
  };
}

export function buildRouteExplanation(decision: HeaderDecision, registry: WorkbenchRegistry): RouteExplanation {
  const selectedUnit = resolveControllerPlan(decision, registry).selected_unit_detail;
  const excludedAgents = registry.agents
    .filter((agent) => agent.trust_tier === "excluded_by_design")
    .map((agent) => ({
      id: agent.id,
      label: agent.label,
      trust_tier: agent.trust_tier,
      reason: agent.trust_evidence,
      blocked_actions: agent.blocked_actions,
    }));

  if (!decision.execution_required || decision.route === "direct_answer") {
    return {
      room_decision: "do_not_open_room",
      headline: decision.direct_answer ?? "这个任务不需要开 room。",
      reasons: [
        "任务可以由单步判断或稳定能力覆盖。",
        "不需要多 agent 合并，也不需要新增协作上下文。",
      ],
      blocked_actions: decision.blocked_actions,
      excluded_agents: excludedAgents,
      decision_basis_fields: ["route", "execution_required", "required_capabilities", "blocked_actions"],
    };
  }

  if (selectedUnit?.trust_tier === "verified") {
    return {
      room_decision: "do_not_open_room",
      headline: `使用已验证能力：${selectedUnit.label}`,
      reasons: [
        "已有 verified skill 覆盖主要工作。",
        "继续开 room 只会增加 token 成本和合并成本。",
      ],
      blocked_actions: selectedUnit.blocked_actions,
      excluded_agents: excludedAgents,
      decision_basis_fields: ["route", "required_capabilities", "trust_tier", "verified_scope"],
    };
  }

  if (selectedUnit?.id === "product_critic_agent") {
    return {
      room_decision: "do_not_open_room",
      headline: "单个 declared agent 足够，先做 contract-compliance，再谈晋升。",
      reasons: [
        "当前任务是批判和边界判断，不是多 agent 探索。",
        "先验证协议，再决定是否需要更多协作带宽。",
      ],
      blocked_actions: selectedUnit.blocked_actions,
      excluded_agents: excludedAgents,
      decision_basis_fields: ["route", "required_capabilities", "trust_tier", "human_checkpoint_policy"],
    };
  }

  return {
    room_decision: "open_room",
    headline: "任务需要最小可信团队和 artifact 交接。",
    reasons: [
      "任务需要多个结构化 artifact 合并。",
      "单 agent 无法同时承担判断、交接和复核。",
      "协作协议必须先于扩队展开。",
    ],
    blocked_actions: [...decision.blocked_actions, ...excludedAgents.flatMap((agent) => agent.blocked_actions)],
    excluded_agents: excludedAgents,
    decision_basis_fields: ["route", "required_capabilities", "unknowns", "approval_boundary", "blocked_actions"],
  };
}

export function resolveControllerPlan(
  decision: HeaderDecision,
  registry: WorkbenchRegistry,
): ControllerPlan {
  if (!decision.execution_required || decision.route === "direct_answer") {
    return {
      source: "deterministic",
      resolved_runtime: "direct_answer",
      selected_unit: null,
      trust_tier: null,
      execution_mode: "none",
      room_required: false,
      human_checkpoints: [],
      trust_warnings: [],
    };
  }

  if (decision.required_capabilities.includes("job_fit_scoring")) {
    const unit = registry.skills.find((item) => item.id === "boss_job_fit_skill");
    return planFromUnit("verified_skill", unit, false, []);
  }

  if (decision.required_capabilities.includes("product_critique")) {
    const unit = registry.agents.find((item) => item.id === "product_critic_agent");
    return planFromUnit("declared_agent", unit, false, [
      "未认证 · 需人审 · 不可写 memory · 不可污染 verified 链路",
      "必须通过 Certification 后才能进行 scoped promotion。",
    ]);
  }

  if (decision.route === "task_room" || decision.required_capabilities.includes("task_room_planning")) {
    return {
      source: "deterministic",
      resolved_runtime: "task_room_plan",
      selected_unit: "planned_task_room",
      trust_tier: "declared",
      execution_mode: "planned",
      room_required: true,
      human_checkpoints: [
        "批准最终建议",
        "批准外部动作",
        "批准 memory 写回",
      ],
      trust_warnings: [
        "Task Room 在 v2 中只是 planned / 未执行。",
        "Declared agents 在可信使用前必须经过 eval。",
      ],
    };
  }

  return {
    source: "deterministic",
    resolved_runtime: "validated_gap",
    selected_unit: null,
    trust_tier: "provisional",
    execution_mode: "planned",
    room_required: false,
    human_checkpoints: ["在 builder 工作前批准能力 proposal"],
    trust_warnings: ["没有已注册 verified 能力覆盖这个请求。"],
  };
}

function planFromUnit(
  runtime: ControllerPlan["resolved_runtime"],
  unit: RegistryUnit | undefined,
  roomRequired: boolean,
  trustWarnings: string[],
): ControllerPlan {
  if (!unit) {
    return {
      source: "deterministic",
      resolved_runtime: "validated_gap",
      selected_unit: null,
      trust_tier: "provisional",
      execution_mode: "planned",
      room_required: false,
      human_checkpoints: ["批准能力 proposal"],
      trust_warnings: ["没有找到对应的 registry unit。"],
    };
  }
  return {
    source: "deterministic",
    resolved_runtime: runtime,
    selected_unit: unit.id,
    trust_tier: unit.trust_tier,
    execution_mode: unit.execution_mode,
    room_required: roomRequired,
    human_checkpoints: [unit.human_checkpoint_policy],
    trust_warnings: trustWarnings,
    selected_unit_detail: unit,
  };
}

export function scoreProductCriticCase(caseDef: CertificationCase, result: ProductCriticCaseResult) {
  const blob = JSON.stringify(result.artifact).toLowerCase();
  const missing_terms = caseDef.required_terms.filter((term) => !blob.includes(term.toLowerCase()));
  const forbidden_hits = caseDef.forbidden_recommendations.filter((term) =>
    blob.includes(term.toLowerCase()),
  );
  const required_fields_present =
    result.artifact.risks.length > 0 &&
    result.artifact.counterarguments.length > 0 &&
    result.artifact.recommendation.length > 0 &&
    result.artifact.human_review_questions.length > 0;

  return {
    passed: missing_terms.length === 0 && forbidden_hits.length === 0 && required_fields_present,
    missing_terms,
    forbidden_hits,
    required_fields_present,
  };
}

export function estimateTokenCount(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 3.5));
}

function hasEvidenceAtIndex(artifact: ProductResearchArtifact, index: number) {
  return artifact.evidence[index]?.trim().length > 0;
}

export function buildArtifactHandoffDemo(registry: WorkbenchRegistry, task: string): ArtifactHandoffResponse {
  const producer = registry.agents.find((item) => item.id === "research_synthesis_agent") ?? registry.agents[0];
  const consumer = registry.agents.find((item) => item.id === "product_critic_agent") ?? registry.agents[0];
  const artifact: ProductResearchArtifact = {
    artifact_id: "research_collaboration_brief_v1",
    producer_agent: producer.id,
    contract_version: "product_research_opportunity_v1",
    judgment: "该任务应该先验证协作协议，而不是直接扩展 agent 数量。",
    evidence: [
      "Linear、Slack、飞书、Paperclip、Symphony 这类产品的协作边界不同，不能用同一套聊天式上下文替代。",
    ],
    confidence: 0.74,
    blocked_actions: ["open_ended_swarm", "claim_verified_without_eval"],
    missing_information: [
      "关于 Paperclip 与 Symphony 的公开证据不足，需要人工补证据。",
      "Agent A 的执行 trace 只保留摘要，不保留原始长 trace。",
    ],
    risk_register: [],
  };

  const requiredFields = ["judgment", "evidence[0]", "evidence[1]", "confidence", "blocked_actions", "risk_register"];
  const checks: ArtifactContractCheck[] = [
    {
      id: "judgment",
      label: "judgment",
      passed: artifact.judgment.trim().length > 0,
      detail: "必须给出可判定的协作判断。",
    },
    {
      id: "evidence[0]",
      label: "evidence[0]",
      passed: hasEvidenceAtIndex(artifact, 0),
      detail: "至少保留一条证据。",
    },
    {
      id: "evidence[1]",
      label: "evidence[1]",
      passed: hasEvidenceAtIndex(artifact, 1),
      detail: "第二条证据故意缺失，用来触发 missing fields。",
    },
    {
      id: "confidence",
      label: "confidence",
      passed: Number.isFinite(artifact.confidence),
      detail: "置信度必须显式出现。",
    },
    {
      id: "blocked_actions",
      label: "blocked_actions",
      passed: artifact.blocked_actions.length > 0,
      detail: "必须列出不能做的动作。",
    },
    {
      id: "risk_register",
      label: "risk_register",
      passed: artifact.risk_register.length > 0,
      detail: "风险清单不能为空，便于下游复核。",
    },
  ];

  const missingFields = checks.filter((item) => !item.passed).map((item) => item.id);

  return {
    execution_source: "deterministic_protocol_fixture",
    task,
    agents: {
      producer,
      consumer,
    },
    artifact_contract: {
      contract_version: artifact.contract_version,
      required_fields: requiredFields,
      optional_fields: ["missing_information", "risk_notes", "next_validation_step"],
      handoff_rule: "Agent A 的 artifact 必须先过 contract 校验，Agent B 只能消费通过或降级后的结构化输入。",
    },
    artifact,
    validation: {
      status: missingFields.length ? "failed" : "passed",
      missing_fields: missingFields,
      checks,
      action: missingFields.length ? "degrade_to_human_review" : "proceed",
    },
    downstream_input_packet: {
      consumer_agent: consumer.id,
      included_fields: {
        judgment: artifact.judgment,
        evidence: artifact.evidence,
        confidence: artifact.confidence,
        blocked_actions: artifact.blocked_actions,
      },
      excluded_context: [
        "原始 agent trace",
        "长段自然语言讨论",
        "不在 contract 内的推演草稿",
      ],
      missing_fields: missingFields,
    },
    downstream_decision: {
      decision: missingFields.length ? "Review" : "Go",
      consistent_basis_fields: ["judgment", "evidence[0]", "confidence", "blocked_actions"],
      confidence: 0.63,
      note: missingFields.length
        ? "缺少第二条证据和风险清单，所以下游只能进入人审或补齐，而不能直接放行。"
        : "合同通过，下游可以继续。",
    },
  } as unknown as ArtifactHandoffResponse;
}

export function buildProtocolComparisonDemo(task: string, registry: WorkbenchRegistry): ProtocolComparisonResponse {
  const handoff = buildArtifactHandoffDemo(registry, task);
  const rawTrace = {
    task,
    agent_trace: [
      "Agent A 收集公开资料、写出长 trace、保留全部上下文。",
      "Agent B 读取完整 trace 后再做判断。",
      "本次比较只关心是否真的需要这些原始上下文。",
    ],
    handoff,
    hidden_context: [
      "原始搜索笔记",
      "中间推理草稿",
      "重复确认语句",
      "和最终 decision 无关的来回对话",
    ],
  };
  const compressedState = {
    task,
    room_state: "contract_only",
    artifact_inventory: [
      {
        artifact_id: handoff.artifact.artifact_id,
        contract_version: handoff.artifact.contract_version,
        judgment: handoff.artifact.judgment,
        evidence_count: handoff.artifact.evidence.length,
        missing_fields: handoff.validation.missing_fields,
      },
    ],
    decision_basis_fields: handoff.downstream_decision.consistent_basis_fields,
    excluded_context: handoff.downstream_input_packet.excluded_context,
  };
  const rawTraceTokens = estimateTokenCount(rawTrace);
  const compressedTokens = estimateTokenCount(compressedState);
  const decision: "Go" | "Review" | "No-go" = handoff.downstream_decision.decision;

  return {
    execution_source: "deterministic_protocol_fixture",
    task,
    room_case: "product_research_collaboration_tools_v1",
    rows: [
      {
        mode: "raw_trace",
        label: "raw trace 全量回传",
        tokens: rawTraceTokens,
        downstream_decision: decision,
        decision_basis_fields: handoff.downstream_decision.consistent_basis_fields,
        payload_summary: "保留完整 trace、上下文和中间草稿。",
      },
      {
        mode: "compressed_state",
        label: "compressed state + artifact 清单",
        tokens: compressedTokens,
        downstream_decision: decision,
        decision_basis_fields: handoff.downstream_decision.consistent_basis_fields,
        payload_summary: "只保留 state、artifact 清单和决策依据字段。",
      },
    ],
    token_savings: {
      raw_trace_tokens: rawTraceTokens,
      compressed_state_tokens: compressedTokens,
      saved_tokens: Math.max(rawTraceTokens - compressedTokens, 0),
      saved_percent:
        rawTraceTokens > compressedTokens && rawTraceTokens > 0
          ? Math.round(((rawTraceTokens - compressedTokens) / rawTraceTokens) * 100)
          : 0,
    },
    decision_consistent: true,
    shared_basis_fields: handoff.downstream_decision.consistent_basis_fields,
    playbook_preview: {
      title: "same task, smaller payload, same decision",
      should_writeback: false,
      next_run_rule: "下次同类任务优先复用 compressed state + artifact 清单，不再回传 raw trace。",
      reuse_benefit: "把第一次协作的判断结果压成可复用 playbook，减少重复 token 支出。",
    },
  } as unknown as ProtocolComparisonResponse;
}
