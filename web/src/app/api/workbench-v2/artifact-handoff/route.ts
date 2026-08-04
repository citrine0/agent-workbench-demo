import { NextResponse } from "next/server";

import {
  callOpenAiCompatibleJsonWithMeta,
  readWorkbenchRegistry,
  type ArtifactHandoffResponse,
  type ProductResearchArtifact,
} from "@/lib/workbench-v2";
import {
  DEFAULT_ARTIFACT_CONTRACT,
  buildArtifactPrompt,
  defaultRoomTask,
  injectArtifactDefect,
  moonshotEndpoint,
  moonshotModel,
  moonshotTemperature,
  normalizeProductResearchArtifact,
  validateProductResearchArtifact,
  type DefectInjectionField,
} from "@/lib/workbench-live";

export const runtime = "nodejs";

type ArtifactHandoffRequest = {
  task?: string;
  /** 默认注入缺陷。校验器只有拦下过东西，才被证明存在。 */
  inject_defect?: boolean;
  defect_field?: DefectInjectionField;
};

const producerSystemPrompt =
  "你是研究综合 Agent。只返回严格 JSON，字段名保持英文，内容用中文且具体。不要输出 markdown。";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ArtifactHandoffRequest;
    const registry = await readWorkbenchRegistry();
    const task = body.task?.trim() || defaultRoomTask;
    const injectDefect = body.inject_defect !== false;
    const defectField: DefectInjectionField = body.defect_field ?? "missing_information";
    const producer = registry.agents.find((item) => item.id === "research_synthesis_agent") ?? registry.agents[0];
    const consumer = registry.agents.find((item) => item.id === "product_critic_agent") ?? registry.agents[0];
    const apiKey = process.env.MOONSHOT_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          status: "missing_api_key",
          message: "缺少 MOONSHOT_API_KEY。Beat 2 现在使用 Kimi live LLM 生成 artifact。",
        },
        { status: 400 },
      );
    }

    const contract = registry.artifact_contract ?? DEFAULT_ARTIFACT_CONTRACT;
    const producerUserPrompt = buildArtifactPrompt(task, registry.agents, contract);
    const artifactDraft = await callOpenAiCompatibleJsonWithMeta<Partial<ProductResearchArtifact>>({
      endpoint: moonshotEndpoint,
      apiKey,
      model: moonshotModel,
      temperature: moonshotTemperature,
      system: producerSystemPrompt,
      user: producerUserPrompt,
      label: `Beat2 Artifact Kimi model=${moonshotModel}`,
    });

    const producedArtifact = normalizeProductResearchArtifact(artifactDraft.data, contract);
    // 送进校验器的是注入缺陷后的版本；原始产出保留在 producer_trace 里可对照。
    const artifact = injectDefect ? injectArtifactDefect(producedArtifact, defectField) : producedArtifact;
    const validation = validateProductResearchArtifact(artifact, contract);

    // Agent B 这一格是确定性闸门，不是第二次 LLM 调用。规则写在这里，可被逐条复核。
    const downstreamDecision: ArtifactHandoffResponse["downstream_decision"]["decision"] = !validation.passed
      ? "Review"
      : artifact.confidence >= 0.7
        ? "Go"
        : "Review";

    const downstreamNote = validation.passed
      ? artifact.confidence >= 0.7
        ? "artifact contract 通过，且置信度足够，允许继续。"
        : "artifact contract 通过，但置信度偏保守，仍建议 review 后再推进。"
      : `artifact contract 未通过（缺 ${validation.missing_fields.join(", ")}），降级到 human review，不进入下游执行。`;

    return NextResponse.json({
      execution_source: "live_llm",
      provider: "kimi",
      model: moonshotModel,
      usage: artifactDraft.usage,
      task,
      agents: {
        producer,
        consumer,
      },
      artifact_contract: contract,
      artifact,
      /** Beat 3 的 raw trace 分支消费这个对象——真实字节，不是对 trace 的描述。 */
      producer_trace: {
        system_prompt: producerSystemPrompt,
        user_prompt: producerUserPrompt,
        raw_response: artifactDraft.raw_text,
        usage: artifactDraft.usage,
      },
      defect_injection: {
        enabled: injectDefect,
        field: injectDefect ? defectField : null,
        rationale: "一道从未拦下过任何东西的校验器，无法证明自己是校验器。默认剥掉一个必填字段，让 failed 分支可见。",
      },
      validation: {
        status: validation.passed ? "passed" : "failed",
        missing_fields: validation.missing_fields,
        checks: validation.checks,
        action: validation.passed ? "proceed" : "degrade_to_human_review",
      },
      downstream_input_packet: {
        consumer_agent: consumer.id,
        included_fields: {
          judgment: artifact.judgment,
          evidence: artifact.evidence,
          confidence: artifact.confidence,
          blocked_actions: artifact.blocked_actions,
          risk_register: artifact.risk_register,
        },
        excluded_context: ["Agent A 的 system / user prompt 原文", "模型原始回复未解析文本", "不在 contract 内的推演草稿"],
        missing_fields: validation.missing_fields,
      },
      downstream_decision: {
        // 明示：这一步是代码里的确定性规则，不是 LLM 调用。
        evaluator: "deterministic_gate",
        evaluator_note: "contract 校验 + confidence 阈值，规则写死在 route 里，不消耗 token，也不会因模型波动改变。",
        rule: "validation.passed === false → Review；否则 confidence >= 0.7 → Go，else Review。",
        decision: downstreamDecision,
        consistent_basis_fields: ["judgment", "evidence", "confidence", "blocked_actions", "risk_register"],
        confidence: artifact.confidence,
        note: downstreamNote,
      },
    } satisfies ArtifactHandoffResponse);
  } catch (error) {
    return NextResponse.json(
      {
        status: "artifact_handoff_error",
        message: error instanceof Error ? error.message : "Artifact handoff failed.",
      },
      { status: 500 },
    );
  }
}
