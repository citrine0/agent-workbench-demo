import { NextResponse } from "next/server";

import {
  callOpenAiCompatibleJson,
  inferFallbackDecision,
  normalizeHeaderDecision,
  readWorkbenchRegistry,
  resolveControllerPlan,
} from "@/lib/workbench-v2";

export const runtime = "nodejs";

type RouteRequest = {
  task?: string;
};

const deepseekEndpoint = "https://api.deepseek.com/chat/completions";
const deepseekModel = "deepseek-v4-pro";

function buildHeaderPrompt(task: string) {
  return [
    "你是 Agent Workbench v2 的 Header Agent。",
    "你的职责只有两件：判断任务类型，并列出需要的能力。",
    "不要选择具体 agent。不要执行工具。不要默认创建 Task Room。",
    "只返回严格 JSON，字段形状必须完全一致：",
    '{"route":"direct_answer|skill|single_agent|task_room|header_gate_escalation","execution_required":true,"required_capabilities":["..."],"constraints":["..."],"unknowns":["..."],"approval_boundary":["..."],"blocked_actions":["..."],"direct_answer":null}',
    "字段名、route 枚举和 capability id 必须保持英文 token；constraints、unknowns、approval_boundary、direct_answer 等展示文案使用中文。",
    "支持的 capabilities: job_fit_scoring, product_critique, task_room_planning。",
    "规则：",
    "- 求职 / BOSS / JD / 简历匹配任务应 route 到 skill，并声明 job_fit_scoring。",
    "- 批判 / over-agentization / trust risk 任务应 route 到 single_agent，并声明 product_critique。",
    "- 产品研究或发布评审如果需要多个 artifact，应 route 到 task_room，并声明 task_room_planning。",
    "- 简单问题可以 route 到 direct_answer，并设置 execution_required=false。",
    "- 外部动作、memory 写回、能力晋升都必须写入 approval_boundary。",
    "",
    `Task: ${task}`,
  ].join("\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RouteRequest;
    const task = body.task?.trim() || "帮我判断岗位匹配并给出简历证据";
    const registry = await readWorkbenchRegistry();
    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          status: "missing_api_key",
          message: "缺少 DEEPSEEK_API_KEY。v2 的 Header routing 必须使用 live LLM。",
        },
        { status: 400 },
      );
    }

    let rawDecision: Record<string, unknown>;
    try {
      rawDecision = (await callOpenAiCompatibleJson({
        endpoint: deepseekEndpoint,
        apiKey,
        model: deepseekModel,
        temperature: 0.2,
        system: "为 Header Agent routing 返回严格 JSON。除字段名和枚举 token 外，展示文案使用中文。",
        user: buildHeaderPrompt(task),
      })) as Record<string, unknown>;
    } catch (error) {
      return NextResponse.json(
        {
          status: "header_live_llm_error",
          message: error instanceof Error ? error.message : "DeepSeek Header routing 失败。",
          fallback_decision_preview: inferFallbackDecision(task),
        },
        { status: 502 },
      );
    }

    const decision = normalizeHeaderDecision(rawDecision);
    const controller = resolveControllerPlan(decision, registry);

    return NextResponse.json({
      header: {
        source: "live_llm",
        provider: "deepseek",
        model: deepseekModel,
        decision,
      },
      controller,
      registry_principle: registry.trust_model.principle,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "route_error",
        message: error instanceof Error ? error.message : "Workbench v2 route 失败。",
      },
      { status: 500 },
    );
  }
}
