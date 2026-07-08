import { NextResponse } from "next/server";

import { createRoomPlan, type HeaderDecisionContract } from "@/lib/room-planning";

type Provider = "deepseek" | "kimi" | "minimax" | "glm" | "custom";
type RuntimePolicy = "low_cost" | "balanced" | "deep_research";

type HeaderAgentDecisionRequest = {
  task?: string;
  runtimePolicy?: RuntimePolicy;
  userCapabilityBoundary?: string;
  expectedSchema?: "HeaderAgentDecision";
  mode?: "server_route";
  provider?: Provider;
  model?: string;
  apiKeyEnv?: string;
  providerEndpoint?: string;
};

const providerDefaults: Record<
  Provider,
  {
    apiKeyEnv: string;
    defaultModel: string;
    endpoint: string;
  }
> = {
  deepseek: {
    apiKeyEnv: "DEEPSEEK_API_KEY",
    defaultModel: "deepseek-v4-pro",
    endpoint: "https://api.deepseek.com/chat/completions",
  },
  kimi: {
    apiKeyEnv: "MOONSHOT_API_KEY",
    defaultModel: "kimi-k2.7-code",
    endpoint: "https://api.moonshot.cn/v1/chat/completions",
  },
  minimax: {
    apiKeyEnv: "MINIMAX_API_KEY",
    defaultModel: "MiniMax-M3",
    endpoint: "https://api.minimaxi.com/v1/chat/completions",
  },
  glm: {
    apiKeyEnv: "GLM_API_KEY",
    defaultModel: "glm-5.2",
    endpoint: "https://api.z.ai/api/paas/v4/chat/completions",
  },
  custom: {
    apiKeyEnv: "CUSTOM_LLM_API_KEY",
    defaultModel: "custom-header-agent-model",
    endpoint: "",
  },
};

const outputContract = {
  route: "skill | single_agent | task_room | header_gate_escalation | header_to_header",
  confidence: "number from 0 to 1",
  runtime_policy: "low_cost | balanced | deep_research",
  gap_reason: "string",
  required_capabilities: "string[]",
  budget_required: "boolean",
  budget_cap_suggestion: "number or null",
  needs_task_room: "boolean",
  artifact_contract: "string[]",
  approval_boundary: "string[]",
  allowed_actions: "string[]",
  needs_approval: "string[]",
  blocked_actions: "string[]",
  escalation_required: "boolean",
  escalation_reason: "string or null",
  auto_pass: "boolean",
  header_to_header_request: {
    recipient_role: "string",
    context_summary: "string",
    requested_decision: "string",
    permission_boundary: "string[]",
  },
  evaluation_notes: "string[]",
};

const canonicalCapabilities = [
  "market_research",
  "product_positioning_analysis",
  "competitive_comparison",
  "critical_review",
  "opportunity_assessment",
  "collaboration_protocol_design",
  "artifact_quality_review",
];

function buildPrompt(body: HeaderAgentDecisionRequest) {
  return [
    "You are the Header Agent for an agent-native workbench demo.",
    "Decide how the user's task should be routed: existing skill, single agent, task room, header gate escalation, or header-to-header collaboration.",
    "Do not return workflow_skill. This demo does not route live tasks to workflow_skill.",
    "Route to task_room when the task requires market/product research plus critique, positioning comparison, opportunity assessment, multiple artifacts, or multiple specialist perspectives.",
    "The task '研究 Cursor / Windsurf / Devin 的产品定位，并输出进入机会判断' must be classified as task_room with needs_task_room=true.",
    "Return required_capabilities instead of selecting concrete agents. The Room Controller selects agents after Router Check.",
    `Use only these canonical required_capabilities: ${canonicalCapabilities.join(", ")}.`,
    "Return at most 6 required_capabilities. Do not invent new capability names.",
    "Optimize for multi-agent workflow quality, human-in-the-loop boundaries, role assignment, conflict handling, and completion probability.",
    "Do not recommend or mention specific LLM model names. This page is model-agnostic except for the hidden connector.",
    "Return strict JSON only. Do not wrap it in markdown.",
    "",
    `Task: ${body.task ?? ""}`,
    `Runtime policy requested: ${body.runtimePolicy ?? "balanced"}`,
    `User capability boundary: ${body.userCapabilityBoundary ?? ""}`,
    `Expected schema: ${JSON.stringify(outputContract)}`,
  ].join("\n");
}

function readModelApiKeyEnvMap() {
  const raw = process.env.LLM_MODEL_API_KEY_ENV_MAP;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([model, envName]) => model && typeof envName === "string" && envName,
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function resolveApiKeyEnv(
  body: HeaderAgentDecisionRequest,
  provider: Provider,
  model: string,
) {
  const modelApiKeyEnvMap = readModelApiKeyEnvMap();
  return body.apiKeyEnv || modelApiKeyEnvMap[model] || providerDefaults[provider].apiKeyEnv;
}

function readApiKey(body: HeaderAgentDecisionRequest, provider: Provider, model: string) {
  const envName = resolveApiKeyEnv(body, provider, model);
  return {
    envName,
    apiKey: process.env[envName],
  };
}

function parseJsonText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");

  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Model did not return JSON.");
    return JSON.parse(fenced.slice(start, end + 1));
  }
}

function resolveEndpoint(provider: Provider, override?: string) {
  if (override) return override;
  return providerDefaults[provider].endpoint;
}

function resolveTemperature(provider: Provider, model: string) {
  if (provider === "kimi" && /^kimi-k2\.7-code(?:-highspeed)?$/i.test(model)) {
    return 1;
  }

  return 0.2;
}

function requiresTaskRoom(task?: string) {
  const text = task ?? "";
  return (
    /Cursor/i.test(text) &&
    /Windsurf/i.test(text) &&
    /Devin/i.test(text) &&
    /产品定位|进入机会|机会判断|定位|竞品|研究/.test(text)
  );
}

function normalizeCapabilityName(capability: string) {
  const normalized = capability.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  if (canonicalCapabilities.includes(normalized)) return normalized;
  if (/competitive|competitor|product_research|market_intelligence/.test(normalized)) {
    return "market_research";
  }
  if (/positioning|product_strategy|domain_expertise|icp|wedge/.test(normalized)) {
    return "product_positioning_analysis";
  }
  if (/comparison|benchmark|landscape/.test(normalized)) {
    return "competitive_comparison";
  }
  if (/critique|devil|risk|assumption|review/.test(normalized)) {
    return "critical_review";
  }
  if (/opportunity|entry|feasibility|market_entry|financial/.test(normalized)) {
    return "opportunity_assessment";
  }
  if (/collaboration|protocol|workflow|agent/.test(normalized)) {
    return "collaboration_protocol_design";
  }
  if (/eval|metric|quality|qa|reporting|synthesis/.test(normalized)) {
    return "artifact_quality_review";
  }

  return null;
}

function normalizeCapabilities(value: unknown) {
  const fallback = [
    "market_research",
    "product_positioning_analysis",
    "competitive_comparison",
    "critical_review",
    "opportunity_assessment",
    "artifact_quality_review",
  ];
  const normalized = asStringArray(value)
    .map(normalizeCapabilityName)
    .filter((item): item is string => Boolean(item));
  const unique = Array.from(new Set(normalized));
  return (unique.length ? unique : fallback).slice(0, 6);
}

function normalizeDecision(decision: Record<string, unknown>, body: HeaderAgentDecisionRequest) {
  const shouldForceTaskRoom =
    decision.route === "workflow_skill" ||
    ((decision.needs_task_room === false || !decision.needs_task_room) &&
      requiresTaskRoom(body.task));

  return {
    ...decision,
    route: shouldForceTaskRoom ? "task_room" : decision.route,
    needs_task_room: shouldForceTaskRoom ? true : decision.needs_task_room,
    gap_reason:
      typeof decision.gap_reason === "string" && decision.gap_reason
        ? decision.gap_reason
        : "Requires product research, positioning comparison, opportunity assessment, critique, and decision-grade synthesis.",
    required_capabilities: normalizeCapabilities(decision.required_capabilities),
    artifact_contract:
      Array.isArray(decision.artifact_contract) && decision.artifact_contract.length
        ? decision.artifact_contract
        : [
            "research brief",
            "positioning comparison matrix",
            "market entry opportunity assessment",
            "decision-grade recommendation",
          ],
    evaluation_notes: [
      ...(Array.isArray(decision.evaluation_notes) ? decision.evaluation_notes : []),
      ...(shouldForceTaskRoom
        ? [
            "Normalized to task_room because this task requires market/product research, critique, opportunity assessment, and multiple specialist perspectives.",
          ]
        : []),
    ],
  };
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function checkRouter(decision: Record<string, unknown>, body: HeaderAgentDecisionRequest) {
  const checks = [
    {
      id: "schema_route",
      label: "Route is supported",
      passed:
        typeof decision.route === "string" &&
        ["skill", "single_agent", "task_room", "header_gate_escalation", "header_to_header"].includes(
          decision.route,
        ),
    },
    {
      id: "task_room_trigger",
      label: "Task Room trigger matched",
      passed: !requiresTaskRoom(body.task) || decision.route === "task_room",
    },
    {
      id: "capability_gap",
      label: "Capability gap is explicit",
      passed: asStringArray(decision.required_capabilities).length > 0,
    },
    {
      id: "artifact_contract",
      label: "Artifact contract is present",
      passed: asStringArray(decision.artifact_contract).length > 0,
    },
    {
      id: "approval_boundary",
      label: "Human approval boundary is present",
      passed:
        asStringArray(decision.approval_boundary).length > 0 ||
        asStringArray(decision.needs_approval).length > 0,
    },
  ];

  return {
    status: checks.every((check) => check.passed) ? "pass" : "needs_review",
    checks,
    override_reason:
      requiresTaskRoom(body.task) && decision.route === "task_room"
        ? "Task requires multiple capabilities and decision-grade artifacts, so Task Room is required."
        : null,
  };
}

async function callOpenAiCompatible({
  endpoint,
  apiKey,
  model,
  temperature,
  prompt,
}: {
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  prompt: string;
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
        {
          role: "system",
          content: "Return strict JSON for a HeaderAgentDecision object.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Provider request failed: ${response.status}`);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Provider response did not include message content.");
  return parseJsonText(text);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HeaderAgentDecisionRequest;
    const provider = body.provider ?? "deepseek";
    if (!(provider in providerDefaults)) {
      return NextResponse.json(
        {
          status: "unsupported_provider",
          message: `Unsupported provider: ${provider}`,
        },
        { status: 400 },
      );
    }

    const defaults = providerDefaults[provider];
    const model = body.model || defaults.defaultModel;
    const temperature = resolveTemperature(provider, model);
    const { envName, apiKey } = readApiKey(body, provider, model);
    const endpoint = resolveEndpoint(provider, body.providerEndpoint);

    if (!apiKey) {
      return NextResponse.json(
        {
          status: "missing_api_key",
          message: `Missing server env ${envName}. Add it to web/.env.local, then restart the dev server.`,
          provider,
          model,
        },
        { status: 400 },
      );
    }

    if (!endpoint) {
      return NextResponse.json(
        {
          status: "missing_endpoint",
          message: "Custom provider requires a provider endpoint override.",
          provider,
          model,
        },
        { status: 400 },
      );
    }

    const prompt = buildPrompt(body);
    const decision = normalizeDecision(
      await callOpenAiCompatible({ endpoint, apiKey, model, temperature, prompt }),
      body,
    );
    const router_check = checkRouter(decision, body);
    const room_plan = createRoomPlan(decision as Partial<HeaderDecisionContract>);

    return NextResponse.json({
      source: body.mode ?? "server_route",
      provider,
      model,
      temperature,
      apiKeyEnv: envName,
      endpoint,
      decision,
      router_check,
      room_plan,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "provider_error",
        message: error instanceof Error ? error.message : "Header Agent provider call failed.",
      },
      { status: 500 },
    );
  }
}
