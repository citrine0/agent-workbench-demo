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

export type WorkbenchRegistry = {
  version: string;
  trust_model: {
    principle: string;
    tiers?: Record<string, string>;
    propagation_rule?: string[];
  };
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
