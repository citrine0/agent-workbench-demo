import {
  type ArtifactContractDefinition,
  type ArtifactContractCheck,
  type OpenAiCompatibleUsage,
  type ProductResearchArtifact,
  type RegistryUnit,
} from "@/lib/workbench-v2";

export const moonshotEndpoint = "https://api.moonshot.cn/v1/chat/completions";
export const moonshotModel = "kimi-k2.7-code";
/** 该模型只接受 temperature=1，传其它值会被服务端拒绝。 */
export const moonshotTemperature = 1;
export const defaultRoomTask =
  "研究 Linear、Slack、飞书、Paperclip、Symphony，判断 Agent 如何进入协作工作流，并输出 guardrails、human-in-the-loop 和面试观点。";
export const DEFAULT_ARTIFACT_CONTRACT: ArtifactContractDefinition = {
  contract_version: "product_research_opportunity_v1",
  required_fields: [
    "judgment",
    "evidence[0]",
    "evidence[1]",
    "confidence",
    "blocked_actions",
    "missing_information",
    "risk_register",
  ],
  optional_fields: ["artifact_id", "producer_agent"],
  handoff_rule: "Agent A 的 artifact 必须先过 contract 校验，Agent B 只能消费通过或降级后的结构化输入。",
};

export type ProtocolDecisionDraft = {
  downstream_decision: "Go" | "Review" | "No-go";
  decision_basis_fields: string[];
  confidence: number;
  note: string;
};

/**
 * Agent A 真实产出的原文。raw trace 分支必须回传这个，而不是一句“这里有很长的 trace”的描述。
 */
export type ProducerTrace = {
  system_prompt: string;
  user_prompt: string;
  raw_response: string;
  usage: OpenAiCompatibleUsage | null;
};

export const DEFECT_INJECTION_FIELDS = ["missing_information", "risk_register", "evidence[1]"] as const;

export type DefectInjectionField = (typeof DEFECT_INJECTION_FIELDS)[number];

/**
 * 校验器只有拦下过东西，才被证明存在。默认剥掉 missing_information，
 * 让 contract validation 真的走 failed 分支，而不是永远显示全绿。
 */
export function injectArtifactDefect(
  artifact: ProductResearchArtifact,
  field: DefectInjectionField,
): ProductResearchArtifact {
  if (field === "risk_register") {
    return { ...artifact, risk_register: [] };
  }
  if (field === "evidence[1]") {
    return { ...artifact, evidence: artifact.evidence.slice(0, 1) };
  }
  return { ...artifact, missing_information: [] };
}

function toTextArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function normalizeProductResearchArtifact(
  raw: Partial<ProductResearchArtifact>,
  contract: ArtifactContractDefinition = DEFAULT_ARTIFACT_CONTRACT,
): ProductResearchArtifact {
  return {
    artifact_id:
      typeof raw.artifact_id === "string" && raw.artifact_id.trim().length > 0
        ? raw.artifact_id.trim()
        : "research_collaboration_brief_v2",
    producer_agent:
      typeof raw.producer_agent === "string" && raw.producer_agent.trim().length > 0
        ? raw.producer_agent.trim()
        : "research_synthesis_agent",
    contract_version:
      typeof raw.contract_version === "string" && raw.contract_version.trim().length > 0
        ? raw.contract_version.trim()
        : contract.contract_version,
    judgment: typeof raw.judgment === "string" ? raw.judgment.trim() : "",
    evidence: toTextArray(raw.evidence),
    confidence: typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence ?? NaN),
    blocked_actions: toTextArray(raw.blocked_actions),
    missing_information: toTextArray(raw.missing_information),
    risk_register: toTextArray(raw.risk_register),
  };
}

function buildArtifactContractCheck(field: string, artifact: ProductResearchArtifact): ArtifactContractCheck {
  switch (field) {
    case "judgment":
      return {
        id: field,
        label: field,
        passed: artifact.judgment.trim().length > 0,
        detail: "必须给出可判定的协作判断。",
      };
    case "evidence[0]":
      return {
        id: field,
        label: field,
        passed: artifact.evidence.length >= 1,
        detail: "至少保留一条证据。",
      };
    case "evidence[1]":
      return {
        id: field,
        label: field,
        passed: artifact.evidence.length >= 2,
        detail: "至少保留第二条证据，才能证明不是空泛总结。",
      };
    case "confidence":
      return {
        id: field,
        label: field,
        passed: Number.isFinite(artifact.confidence) && artifact.confidence >= 0 && artifact.confidence <= 1,
        detail: "置信度必须在 0 到 1 之间。",
      };
    case "blocked_actions":
      return {
        id: field,
        label: field,
        passed: artifact.blocked_actions.length > 0,
        detail: "必须列出不能做的动作。",
      };
    case "missing_information":
      return {
        id: field,
        label: field,
        passed: artifact.missing_information.length > 0,
        detail: "必须显式列出还需要人补的证据。",
      };
    case "risk_register":
      return {
        id: field,
        label: field,
        passed: artifact.risk_register.length > 0,
        detail: "风险清单不能为空，便于下游复核。",
      };
    default: {
      const value = (artifact as Record<string, unknown>)[field];
      return {
        id: field,
        label: field,
        passed: Boolean(value),
        detail: "该字段必须在 contract 中存在。",
      };
    }
  }
}

export function validateProductResearchArtifact(
  artifact: ProductResearchArtifact,
  contract: ArtifactContractDefinition = DEFAULT_ARTIFACT_CONTRACT,
) {
  const requiredFields = contract.required_fields.length ? contract.required_fields : DEFAULT_ARTIFACT_CONTRACT.required_fields;
  const checks: ArtifactContractCheck[] = requiredFields.map((field) => buildArtifactContractCheck(field, artifact));

  const missing_fields = checks.filter((check) => !check.passed).map((check) => check.id);
  return {
    checks,
    missing_fields,
    passed: missing_fields.length === 0,
  };
}

export function buildArtifactPrompt(
  task: string,
  registry: RegistryUnit[],
  contract: ArtifactContractDefinition = DEFAULT_ARTIFACT_CONTRACT,
) {
  return [
    "你是 Agent Workbench v2 里的 research_synthesis_agent。",
    "你要为后续 Agent B 产出一个结构化 artifact，不要写长文，不要输出 markdown。",
    "只返回严格 JSON，字段必须完全一致：",
    '{"artifact_id":"research_collaboration_brief_v2","producer_agent":"research_synthesis_agent","contract_version":"product_research_opportunity_v1","judgment":"...","evidence":["...","..."],"confidence":0.0,"blocked_actions":["..."],"missing_information":["..."],"risk_register":["..."]}',
    "要求：",
    "- evidence 至少 2 条，尽量具体。",
    "- missing_information 至少 1 条，说明还缺什么证据才敢更进一步。",
    "- risk_register 至少 1 条，描述协作或信任风险。",
    "- blocked_actions 要包含任何不该做的事，例如 open_ended_swarm 或 claim_verified_without_eval（如适用）。",
    "- judgment 要明确回答这次任务应该怎样协作，不能只是泛泛而谈。",
    "- 场景是产品协作产品研究，不要把 Slack / Linear / 飞书当成同类替代。",
    `- contract_version: ${contract.contract_version}`,
    `- required_fields: ${contract.required_fields.join(", ")}`,
    `- optional_fields: ${contract.optional_fields.join(", ")}`,
    `- handoff_rule: ${contract.handoff_rule}`,
    "",
    `Task: ${task}`,
    `Known registry units: ${registry.map((item) => `${item.label}(${item.trust_tier})`).join(" | ")}`,
  ].join("\n");
}

/**
 * raw trace 分支：把 Agent A 这次真实调用的 system prompt、user prompt、模型原始回复
 * 原封不动回传给 Agent B。没有模拟，没有占位描述——payload 就是上游真实产生的字节。
 */
export function buildRawTraceDecisionPrompt(task: string, trace: ProducerTrace) {
  return [
    "你是 Agent B。上游 Agent A 的完整原始 trace 会全量回传给你，你要自己从里面找出决策依据。",
    "只返回严格 JSON，字段必须完全一致：",
    '{"downstream_decision":"Go|Review|No-go","decision_basis_fields":["..."],"confidence":0.0,"note":"..."}',
    "要求：",
    "- downstream_decision 必须是 Go / Review / No-go 之一。",
    "- decision_basis_fields 只写实际用来决定的字段名。",
    "- note 用中文，简短说明为什么。",
    "",
    `Task: ${task}`,
    "",
    "===== BEGIN RAW UPSTREAM TRACE =====",
    "--- agent_a.system ---",
    trace.system_prompt,
    "--- agent_a.user ---",
    trace.user_prompt,
    "--- agent_a.response ---",
    trace.raw_response,
    "--- agent_a.usage ---",
    JSON.stringify(trace.usage ?? {}, null, 2),
    "===== END RAW UPSTREAM TRACE =====",
  ].join("\n");
}

/**
 * compressed state 分支：只回传 contract 内的结构化字段。
 * 两个分支的指令部分逐字相同，唯一差异是 payload——否则 token 差值不可归因。
 */
export function buildCompressedDecisionPrompt(task: string, artifact: ProductResearchArtifact) {
  return [
    "你是 Agent B。上游只回传压缩后的 contract state + artifact 清单，raw trace 已被丢弃。",
    "只返回严格 JSON，字段必须完全一致：",
    '{"downstream_decision":"Go|Review|No-go","decision_basis_fields":["..."],"confidence":0.0,"note":"..."}',
    "要求：",
    "- downstream_decision 必须是 Go / Review / No-go 之一。",
    "- decision_basis_fields 只写实际用来决定的字段名。",
    "- note 用中文，简短说明为什么。",
    "",
    `Task: ${task}`,
    "",
    "===== BEGIN COMPRESSED STATE =====",
    JSON.stringify(
      {
        artifact_id: artifact.artifact_id,
        contract_version: artifact.contract_version,
        producer_agent: artifact.producer_agent,
        judgment: artifact.judgment,
        evidence: artifact.evidence,
        confidence: artifact.confidence,
        blocked_actions: artifact.blocked_actions,
        missing_information: artifact.missing_information,
        risk_register: artifact.risk_register,
      },
      null,
      2,
    ),
    "===== END COMPRESSED STATE =====",
  ].join("\n");
}

export function normalizeProtocolDecision(raw: Partial<ProtocolDecisionDraft>) {
  const decision =
    raw.downstream_decision === "Go" || raw.downstream_decision === "Review" || raw.downstream_decision === "No-go"
      ? raw.downstream_decision
      : "Review";
  const basis = Array.isArray(raw.decision_basis_fields)
    ? raw.decision_basis_fields.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    downstream_decision: decision,
    decision_basis_fields: basis.length ? basis : ["judgment", "evidence", "confidence", "blocked_actions"],
    confidence: typeof raw.confidence === "number" ? raw.confidence : Number(raw.confidence ?? 0.5),
    note: typeof raw.note === "string" ? raw.note.trim() : "",
  } satisfies ProtocolDecisionDraft;
}

export function usageToTokens(usage: OpenAiCompatibleUsage | null | undefined) {
  if (!usage) return null;
  if (typeof usage.total_tokens === "number") return usage.total_tokens;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const total = promptTokens + completionTokens;
  return total > 0 ? total : null;
}
