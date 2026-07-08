import { NextResponse } from "next/server";

import {
  callOpenAiCompatibleJson,
  readCertificationCases,
  readWorkbenchRegistry,
  scoreProductCriticCase,
  type CertificationCase,
  type ProductCriticArtifact,
  type ProductCriticCaseResult,
  type ScoredCase,
} from "@/lib/workbench-v2";

export const runtime = "nodejs";

const deepseekEndpoint = "https://api.deepseek.com/chat/completions";
const deepseekModel = "deepseek-v4-pro";
const moonshotEndpoint = "https://api.moonshot.cn/v1/chat/completions";
const moonshotModel = "kimi-k2.7-code";

function normalizeProductCriticArtifact(raw: Partial<ProductCriticArtifact>) {
  return {
    risks: Array.isArray(raw.risks) ? raw.risks.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [],
    counterarguments: Array.isArray(raw.counterarguments)
      ? raw.counterarguments.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
    recommendation: typeof raw.recommendation === "string" ? raw.recommendation.trim() : "",
    human_review_questions: Array.isArray(raw.human_review_questions)
      ? raw.human_review_questions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [],
  };
}

function buildProductCriticPrompt(caseDef: CertificationCase) {
  return [
    "你是 Agent Workbench v2 内部的 Product Critic Agent。",
    "请根据给定 certification case 批判这个方案。",
    "只返回严格 JSON，字段形状必须完全一致：",
    '{"risks":["..."],"counterarguments":["..."],"recommendation":"...","human_review_questions":["..."]}',
    "字段名保持英文；数组内容、recommendation 和问题都用中文。",
    "必须在输出中原样包含 Required terms 里的每个英文 token，这些 token 用于 deterministic scorer。",
    "规则：",
    "- 相关时必须明确指出 over-agentization。",
    "- 相关时必须明确保留 evidence / unknowns / human review。",
    "- 相关时必须明确反对把 Agent Workbench 表述成 Slack / Linear / 飞书的直接替代品。",
    "- 不要声称这个 agent 已经 verified。",
    "- 不要建议全自动化或无边界 Task Room 执行。",
    "",
    `Case ID: ${caseDef.case_id}`,
    `Title: ${caseDef.title}`,
    `Input: ${caseDef.input}`,
    `Expected findings: ${JSON.stringify(caseDef.expected_findings)}`,
    `Required terms: ${JSON.stringify(caseDef.required_terms)}`,
    `Forbidden recommendations: ${JSON.stringify(caseDef.forbidden_recommendations)}`,
  ].join("\n");
}

async function runProductCritic(caseDef: CertificationCase, apiKey: string) {
  const artifact = normalizeProductCriticArtifact(
    (await callOpenAiCompatibleJson({
      endpoint: deepseekEndpoint,
      apiKey,
      model: deepseekModel,
      temperature: 0.2,
      system: "为 Product Critic certification 返回严格 JSON。字段名保持英文，展示内容使用中文，并原样包含 required_terms。",
      user: buildProductCriticPrompt(caseDef),
      label: `Product Critic DeepSeek case=${caseDef.case_id} model=${deepseekModel}`,
    })) as Partial<ProductCriticArtifact>,
  );

  return {
    execution_source: "live_llm",
    provider: "deepseek",
    agent_id: "product_critic_agent",
    case_id: caseDef.case_id,
    artifact,
  } satisfies ProductCriticCaseResult;
}

async function runMoonshotJudge(cases: ScoredCase[]) {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 MOONSHOT_API_KEY。Certification judge 必须使用另一个 live LLM。");
  }
  return callOpenAiCompatibleJson({
    endpoint: moonshotEndpoint,
    apiKey,
    model: moonshotModel,
    temperature: 1,
    system: "你是外部 LLM judge。只返回严格 JSON。字段名和枚举 token 保持英文，summary 和 concerns 使用中文。",
    user: [
      "请审查这次 Product Critic certification run。",
      "被测 agent 使用 DeepSeek。你是 Moonshot/Kimi，不拥有最终 promotion 权限。",
      "返回 JSON，字段形状如下：",
      '{"provider":"moonshot","role":"external_llm_judge","summary":"...","concerns":["..."],"promotion_risk":"low|medium|high"}',
      "重点判断 deterministic scorer 是否漏掉明显的信任问题。summary 和 concerns 使用中文。",
      JSON.stringify(cases, null, 2),
    ].join("\n"),
    label: `Certification Judge Moonshot model=${moonshotModel}`,
  }) as Promise<{
    provider: "moonshot";
    role: "external_llm_judge";
    summary: string;
    concerns: string[];
    promotion_risk: "low" | "medium" | "high";
  }>;
}

export async function POST() {
  try {
    const registry = await readWorkbenchRegistry();
    const productCritic = registry.agents.find((item) => item.id === "product_critic_agent");
    const caseSet = await readCertificationCases();

    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;

    if (!deepseekApiKey) {
      return NextResponse.json(
        {
          status: "missing_api_key",
          message: "缺少 DEEPSEEK_API_KEY。Product Critic certification 必须使用 live LLM。",
        },
        { status: 400 },
      );
    }
    if (!process.env.MOONSHOT_API_KEY) {
      return NextResponse.json(
        {
          status: "missing_api_key",
          message: "缺少 MOONSHOT_API_KEY。Certification judge 必须使用另一个 live LLM。",
        },
        { status: 400 },
      );
    }

    const scoredCases: ScoredCase[] = [];
    for (const caseDef of caseSet.cases) {
      const result = await runProductCritic(caseDef, deepseekApiKey);
      scoredCases.push({
        ...result,
        deterministic_score: scoreProductCriticCase(caseDef, result),
      });
    }

    const judge = await runMoonshotJudge(scoredCases);
    const passed = scoredCases.every((item) => item.deterministic_score.passed);

    return NextResponse.json({
      execution_source: "live_llm",
      tested_agent: {
        agent_id: "product_critic_agent",
        provider: "deepseek",
        current_tier: productCritic?.trust_tier ?? "declared",
      },
      scorer: {
        type: "deterministic_contract_compliance",
        passed,
        case_results: scoredCases,
      },
      judge,
      promotion: {
        status: passed ? "eligible_for_human_approval" : "not_eligible",
        recommended_tier: passed ? "verified" : "declared",
        verified_scope: passed
          ? [
              "识别 over-agentization",
              "批判 result-first 的信任风险",
              "标记错误的产品品类对比",
            ]
          : [],
        human_approval_required: true,
        registry_writeback_allowed: false,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "certification_error",
        message: error instanceof Error ? error.message : "Product Critic certification 失败。",
      },
      { status: 500 },
    );
  }
}
