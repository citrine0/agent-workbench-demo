export type CapabilitySource = "personal" | "team" | "global";

export type AgentManifest = {
  id: string;
  name: string;
  description: string;
  capabilities: Record<string, number>;
  strong_at: string[];
  weak_at: string[];
  inputs_required: string[];
  outputs: string[];
  source: CapabilitySource;
  cost_tier: "low" | "medium" | "high";
  latency_tier: "low" | "medium" | "high";
  reliability_score: number;
};

export type CandidateAgentMatch = {
  agent: string;
  score: number;
  reliability_score: number;
  rationale: string;
};

export type CapabilityCoverage = {
  capability: string;
  label: string;
  agent: string;
  selected_agent_id: string;
  source: CapabilitySource;
  contribution: string;
  coverage_score: number;
  candidate_agents: CandidateAgentMatch[];
  covered: boolean;
};

export type RoomPlan = {
  status: "ready" | "not_required";
  agents: string[];
  coverage: CapabilityCoverage[];
  plan_checks: {
    id: string;
    label: string;
    passed: boolean;
  }[];
  reliability_notes: string[];
  execution_steps: string[];
  artifact_contract: string[];
};

export type RouterCheck = {
  status: "pass" | "needs_review";
  checks: {
    id: string;
    label: string;
    passed: boolean;
  }[];
  override_reason: string | null;
};

export type HeaderDecisionContract = {
  route: "skill" | "single_agent" | "task_room" | "header_gate_escalation" | "header_to_header";
  confidence: number;
  runtime_policy: "low_cost" | "balanced" | "deep_research";
  gap_reason: string;
  required_capabilities: string[];
  artifact_contract: string[];
  approval_boundary: string[];
  budget_required: boolean;
  budget_cap_suggestion: number | null;
  needs_task_room: boolean;
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

export const capabilityRegistry: Record<
  string,
  {
    label: string;
    agent: string;
    source: CapabilitySource;
    contribution: string;
  }
> = {
  market_research: {
    label: "Market research",
    agent: "Research Agent",
    source: "global",
    contribution: "collect public evidence and user signals",
  },
  product_positioning_analysis: {
    label: "Product positioning analysis",
    agent: "Product Analyst Agent",
    source: "team",
    contribution: "compare positioning, ICP, wedge, and differentiation",
  },
  competitive_comparison: {
    label: "Competitive comparison",
    agent: "Research Agent",
    source: "global",
    contribution: "build the comparison matrix across products",
  },
  critical_review: {
    label: "Critical review",
    agent: "Product Critic Agent",
    source: "team",
    contribution: "surface counterarguments, risks, and weak assumptions",
  },
  opportunity_assessment: {
    label: "Opportunity assessment",
    agent: "Market Strategy Agent",
    source: "team",
    contribution: "turn evidence into an entry opportunity judgment",
  },
  collaboration_protocol_design: {
    label: "Collaboration protocol design",
    agent: "Collaboration Designer Agent",
    source: "personal",
    contribution: "convert findings into a reusable agent workflow candidate",
  },
  artifact_quality_review: {
    label: "Artifact quality review",
    agent: "QA Agent",
    source: "global",
    contribution: "check contract coverage and decision-grade quality",
  },
};

export const agentManifestRegistry: AgentManifest[] = [
  {
    id: "research_agent",
    name: "Research Agent",
    description: "Use for public-source collection, market signals, and comparison inputs.",
    capabilities: {
      market_research: 0.92,
      competitive_comparison: 0.86,
      product_positioning_analysis: 0.48,
    },
    strong_at: ["source gathering", "market signal synthesis", "comparison inputs"],
    weak_at: ["final strategy call", "deep critique"],
    inputs_required: ["task brief", "target products"],
    outputs: ["evidence brief", "source notes", "comparison inputs"],
    source: "global",
    cost_tier: "low",
    latency_tier: "medium",
    reliability_score: 0.86,
  },
  {
    id: "product_analyst_agent",
    name: "Product Analyst Agent",
    description: "Use for positioning, ICP, wedge, workflow, and differentiation analysis.",
    capabilities: {
      product_positioning_analysis: 0.9,
      competitive_comparison: 0.72,
      opportunity_assessment: 0.58,
    },
    strong_at: ["positioning analysis", "ICP comparison", "workflow tradeoff framing"],
    weak_at: ["fresh evidence collection", "adversarial critique"],
    inputs_required: ["research brief", "product notes"],
    outputs: ["positioning matrix", "product thesis"],
    source: "team",
    cost_tier: "medium",
    latency_tier: "medium",
    reliability_score: 0.84,
  },
  {
    id: "product_critic_agent",
    name: "Product Critic Agent",
    description: "Use when strategy claims need counterarguments, risk analysis, or assumption stress tests.",
    capabilities: {
      critical_review: 0.91,
      opportunity_assessment: 0.46,
      artifact_quality_review: 0.58,
    },
    strong_at: ["counterarguments", "risk logs", "weak assumption detection"],
    weak_at: ["broad market collection", "polished final writing"],
    inputs_required: ["positioning matrix", "opportunity thesis"],
    outputs: ["risk log", "counterargument list"],
    source: "team",
    cost_tier: "medium",
    latency_tier: "low",
    reliability_score: 0.88,
  },
  {
    id: "market_strategy_agent",
    name: "Market Strategy Agent",
    description: "Use for entry opportunity, wedge, sequencing, and recommendation tradeoffs.",
    capabilities: {
      opportunity_assessment: 0.9,
      product_positioning_analysis: 0.65,
      critical_review: 0.5,
    },
    strong_at: ["entry judgment", "market wedge", "sequencing"],
    weak_at: ["raw source collection", "protocol design"],
    inputs_required: ["evidence brief", "risk log", "positioning matrix"],
    outputs: ["entry opportunity judgment", "strategic recommendation"],
    source: "team",
    cost_tier: "medium",
    latency_tier: "medium",
    reliability_score: 0.82,
  },
  {
    id: "collaboration_designer_agent",
    name: "Collaboration Designer Agent",
    description: "Use for turning findings into agent collaboration protocol or reusable workflow assets.",
    capabilities: {
      collaboration_protocol_design: 0.92,
      artifact_quality_review: 0.5,
    },
    strong_at: ["agent workflow design", "protocol shaping", "reusable capability framing"],
    weak_at: ["market evidence", "product critique"],
    inputs_required: ["final thesis", "agent intervention points"],
    outputs: ["collaboration protocol", "workflow candidate"],
    source: "personal",
    cost_tier: "medium",
    latency_tier: "medium",
    reliability_score: 0.8,
  },
  {
    id: "qa_agent",
    name: "QA Agent",
    description: "Use for artifact contract coverage, schema checks, and decision-grade quality gates.",
    capabilities: {
      artifact_quality_review: 0.9,
      critical_review: 0.42,
    },
    strong_at: ["contract checks", "coverage gaps", "schema validation"],
    weak_at: ["primary research", "strategy invention"],
    inputs_required: ["artifact contract", "draft artifacts"],
    outputs: ["quality gate report", "missing evidence list"],
    source: "global",
    cost_tier: "low",
    latency_tier: "low",
    reliability_score: 0.86,
  },
];

export const defaultProductResearchContract: HeaderDecisionContract = {
  route: "task_room",
  confidence: 0.9,
  runtime_policy: "balanced",
  gap_reason:
    "Requires product research, positioning comparison, opportunity assessment, critique, and decision-grade synthesis.",
  required_capabilities: [
    "market_research",
    "product_positioning_analysis",
    "competitive_comparison",
    "critical_review",
    "opportunity_assessment",
    "artifact_quality_review",
  ],
  artifact_contract: [
    "research brief",
    "positioning comparison matrix",
    "market entry opportunity assessment",
    "risk and counterargument log",
    "decision-grade recommendation",
  ],
  approval_boundary: ["budget increase", "external outreach", "final recommendation"],
  budget_required: true,
  budget_cap_suggestion: 5,
  needs_task_room: true,
  allowed_actions: ["public research", "artifact drafting", "internal critique"],
  needs_approval: ["budget increase", "external outreach", "final recommendation"],
  blocked_actions: ["contact external users without approval"],
  escalation_required: false,
  escalation_reason: null,
  auto_pass: false,
  header_to_header_request: null,
  evaluation_notes: [],
};

const canonicalCapabilities = Object.keys(capabilityRegistry);

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

function normalizeCapabilities(capabilities?: string[]) {
  const normalized = (capabilities ?? [])
    .map(normalizeCapabilityName)
    .filter((item): item is string => Boolean(item));
  const unique = Array.from(new Set(normalized));
  return (unique.length ? unique : defaultProductResearchContract.required_capabilities).slice(0, 6);
}

export function createRoomPlan(contract: Partial<HeaderDecisionContract>): RoomPlan {
  const requiredCapabilities = normalizeCapabilities(contract.required_capabilities);
  const artifactContract =
    contract.artifact_contract?.length
      ? contract.artifact_contract
      : defaultProductResearchContract.artifact_contract;

  if (contract.route && contract.route !== "task_room") {
    return {
      status: "not_required",
      agents: [],
      coverage: [],
      plan_checks: [],
      reliability_notes: [],
      execution_steps: [],
      artifact_contract: artifactContract,
    };
  }

  const coverage = requiredCapabilities.map((capability) => {
    const registered = capabilityRegistry[capability];
    const candidateAgents = agentManifestRegistry
      .map((agent) => {
        const capabilityScore = agent.capabilities[capability] ?? 0;
        return {
          agent: agent.name,
          score: Number((capabilityScore * 0.72 + agent.reliability_score * 0.28).toFixed(2)),
          reliability_score: agent.reliability_score,
          rationale:
            capabilityScore > 0
              ? agent.description
              : "No declared capability match.",
        };
      })
      .filter((candidate) => candidate.score >= 0.45)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const selected = candidateAgents[0];
    const selectedManifest = agentManifestRegistry.find((agent) => agent.name === selected?.agent);

    return {
      capability,
      label: registered?.label ?? capability,
      agent: selected?.agent ?? registered?.agent ?? "Generalist Agent",
      selected_agent_id: selectedManifest?.id ?? "generalist_agent",
      source: selectedManifest?.source ?? registered?.source ?? "global",
      contribution:
        selectedManifest?.outputs[0] ??
        registered?.contribution ??
        "cover uncatalogued capability",
      coverage_score: selected?.score ?? 0.35,
      candidate_agents: candidateAgents,
      covered: Boolean(selected),
    };
  });
  const agents = Array.from(new Set(coverage.map((item) => item.agent)));
  const averageCoverage =
    coverage.reduce((sum, item) => sum + item.coverage_score, 0) / Math.max(coverage.length, 1);
  const planChecks = [
    {
      id: "capability_coverage",
      label: "Every required capability has a selected agent",
      passed: coverage.every((item) => item.covered),
    },
    {
      id: "minimum_team",
      label: "Team stays within minimum viable size",
      passed: agents.length <= Math.min(requiredCapabilities.length, 6),
    },
    {
      id: "quality_gate",
      label: "Artifact quality review is covered",
      passed: coverage.some((item) => item.capability === "artifact_quality_review"),
    },
    {
      id: "coverage_score",
      label: "Average coverage score is acceptable",
      passed: averageCoverage >= 0.68,
    },
  ];

  return {
    status: "ready",
    agents,
    coverage,
    plan_checks: planChecks,
    reliability_notes: [
      `Average coverage score: ${averageCoverage.toFixed(2)}`,
      "Selection uses declared capabilities plus reliability score; LLM does not directly pick agents.",
      "Execution feedback should update reliability_score after artifact checks.",
    ],
    execution_steps: [
      "Build evidence brief",
      "Create positioning comparison matrix",
      "Run critical review",
      "Synthesize entry opportunity judgment",
      "Check artifact contract",
    ],
    artifact_contract: artifactContract,
  };
}
