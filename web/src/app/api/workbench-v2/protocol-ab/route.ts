import { NextResponse } from "next/server";

import {
  callOpenAiCompatibleJsonWithMeta,
  readWorkbenchRegistry,
  type ProductResearchArtifact,
  type ProtocolComparisonResponse,
  type ProtocolComparisonRow,
} from "@/lib/workbench-v2";
import {
  DEFAULT_ARTIFACT_CONTRACT,
  buildArtifactPrompt,
  buildCompressedDecisionPrompt,
  buildRawTraceDecisionPrompt,
  defaultRoomTask,
  moonshotEndpoint,
  moonshotModel,
  moonshotTemperature,
  normalizeProductResearchArtifact,
  normalizeProtocolDecision,
  usageToTokens,
  validateProductResearchArtifact,
  type ProducerTrace,
} from "@/lib/workbench-live";

export const runtime = "nodejs";

type ProtocolAbRequest = {
  task?: string;
  artifact?: Partial<ProductResearchArtifact>;
  /** Beat 2 真实跑出来的上游 trace。缺省时本路由自己重跑一次 Agent A 生成真 trace。 */
  producer_trace?: Partial<ProducerTrace>;
};

const producerSystemPrompt =
  "你是 research_synthesis_agent。只返回严格 JSON，字段名保持英文，内容用中文且具体。不要输出 markdown。";

const decisionSystemPrompt = "你是 Agent B。只返回严格 JSON，字段名保持英文，内容用中文。不要输出 markdown。";

function isUsableTrace(trace: Partial<ProducerTrace> | undefined): trace is ProducerTrace {
  return Boolean(
    trace &&
      typeof trace.system_prompt === "string" &&
      typeof trace.user_prompt === "string" &&
      typeof trace.raw_response === "string" &&
      trace.raw_response.trim().length > 0,
  );
}

/** 没拿到 Beat 2 的 trace 时，现场重跑一次 Agent A —— 依然是真调用，不是编的。 */
async function regenerateProducerTrace(
  task: string,
  registry: Awaited<ReturnType<typeof readWorkbenchRegistry>>,
  apiKey: string,
): Promise<{ artifact: ProductResearchArtifact; trace: ProducerTrace }> {
  const contract = registry.artifact_contract ?? DEFAULT_ARTIFACT_CONTRACT;
  const userPrompt = buildArtifactPrompt(task, registry.agents, contract);
  const seed = await callOpenAiCompatibleJsonWithMeta<Partial<ProductResearchArtifact>>({
    endpoint: moonshotEndpoint,
    apiKey,
    model: moonshotModel,
    temperature: moonshotTemperature,
    system: producerSystemPrompt,
    user: userPrompt,
    label: `Beat3 Artifact Seed Kimi model=${moonshotModel}`,
  });

  return {
    artifact: normalizeProductResearchArtifact(seed.data, contract),
    trace: {
      system_prompt: producerSystemPrompt,
      user_prompt: userPrompt,
      raw_response: seed.raw_text,
      usage: seed.usage,
    },
  };
}

async function runDecisionCall(prompt: string, apiKey: string, label: string) {
  const response = await callOpenAiCompatibleJsonWithMeta<{
    downstream_decision?: "Go" | "Review" | "No-go";
    decision_basis_fields?: string[];
    confidence?: number;
    note?: string;
  }>({
    endpoint: moonshotEndpoint,
    apiKey,
    model: moonshotModel,
    temperature: moonshotTemperature,
    system: decisionSystemPrompt,
    user: prompt,
    label,
  });

  const promptTokens = typeof response.usage?.prompt_tokens === "number" ? response.usage.prompt_tokens : null;

  return {
    decision: normalizeProtocolDecision(response.data),
    usage: response.usage,
    /** 优先用 provider 上报的 total_tokens；拿不到再退到字符估算，并在响应里标明。 */
    tokens: usageToTokens(response.usage),
    promptTokens,
    payloadChars: prompt.length,
  };
}

function estimateTokens(chars: number) {
  return Math.max(1, Math.ceil(chars / 3.5));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ProtocolAbRequest;
    const registry = await readWorkbenchRegistry();
    const task = body.task?.trim() || defaultRoomTask;
    const contract = registry.artifact_contract ?? DEFAULT_ARTIFACT_CONTRACT;
    const apiKey = process.env.MOONSHOT_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          status: "missing_api_key",
          message: "缺少 MOONSHOT_API_KEY。Beat 3 现在使用 Kimi live LLM 生成 A/B 比较结果。",
        },
        { status: 400 },
      );
    }

    const upstreamTraceUsable = isUsableTrace(body.producer_trace);
    let artifact: ProductResearchArtifact;
    let trace: ProducerTrace;

    if (upstreamTraceUsable && body.artifact && Object.keys(body.artifact).length > 0) {
      artifact = normalizeProductResearchArtifact(body.artifact, contract);
      trace = body.producer_trace as ProducerTrace;
    } else {
      const regenerated = await regenerateProducerTrace(task, registry, apiKey);
      artifact =
        body.artifact && Object.keys(body.artifact).length > 0
          ? normalizeProductResearchArtifact(body.artifact, contract)
          : regenerated.artifact;
      trace = regenerated.trace;
    }

    const validation = validateProductResearchArtifact(artifact, contract);

    const rawPrompt = buildRawTraceDecisionPrompt(task, trace);
    const compressedPrompt = buildCompressedDecisionPrompt(task, artifact);

    const [rawRun, compressedRun] = await Promise.all([
      runDecisionCall(rawPrompt, apiKey, `Beat3 Raw Trace Kimi model=${moonshotModel}`),
      runDecisionCall(compressedPrompt, apiKey, `Beat3 Compressed State Kimi model=${moonshotModel}`),
    ]);

    const measured = rawRun.tokens !== null && compressedRun.tokens !== null;
    const rawTokens = rawRun.tokens ?? estimateTokens(rawRun.payloadChars);
    const compressedTokens = compressedRun.tokens ?? estimateTokens(compressedRun.payloadChars);

    const rows: ProtocolComparisonRow[] = [
      {
        mode: "raw_trace",
        label: "raw trace 全量回传",
        tokens: rawTokens,
        prompt_tokens: rawRun.promptTokens,
        payload_chars: rawRun.payloadChars,
        downstream_decision: rawRun.decision.downstream_decision,
        decision_basis_fields: rawRun.decision.decision_basis_fields,
        payload_summary: "Agent A 的 system prompt、user prompt 和模型原始回复，原样回传。",
      },
      {
        mode: "compressed_state",
        label: "compressed state + artifact 清单",
        tokens: compressedTokens,
        prompt_tokens: compressedRun.promptTokens,
        payload_chars: compressedRun.payloadChars,
        downstream_decision: compressedRun.decision.downstream_decision,
        decision_basis_fields: compressedRun.decision.decision_basis_fields,
        payload_summary: "只保留 contract 内字段，丢弃 prompt 原文与未解析回复。",
      },
    ];

    const sharedBasisFields = rows[0].decision_basis_fields.filter((field) =>
      rows[1].decision_basis_fields.includes(field),
    );
    const decisionConsistent = rows[0].downstream_decision === rows[1].downstream_decision;
    const basisIdentical =
      [...rows[0].decision_basis_fields].sort().join("|") === [...rows[1].decision_basis_fields].sort().join("|");

    const savedTokens = rawTokens - compressedTokens;
    const savedPercent = rawTokens > 0 ? Math.round((savedTokens / rawTokens) * 100) : 0;

    const verdict: ProtocolComparisonResponse["verdict"] = decisionConsistent
      ? {
          status: "consistent",
          headline:
            savedTokens > 0
              ? `同一任务，payload 少 ${savedTokens} tokens（${savedPercent}%），下游决策一致。`
              : "两种回传方式下游决策一致，但本次压缩没有带来 token 收益。",
          detail: basisIdentical
            ? "两跑列出的决策依据字段完全相同，说明省掉的是 trace 噪音，不是决策依据。"
            : `决策相同但依据字段不同（raw: ${rows[0].decision_basis_fields.join(" / ")}；compressed: ${rows[1].decision_basis_fields.join(" / ")}）。结论一致可能是巧合，需要更多样本。`,
        }
      : {
          status: "divergent",
          headline: `两跑决策不一致：raw=${rows[0].downstream_decision}，compressed=${rows[1].downstream_decision}。`,
          detail:
            "压缩在这类任务上改变了下游判断——这是本次实测的真实结果，不是失败。它说明该 contract 的字段集还不足以承载决策，需要扩充 required_fields 而不是继续压缩。",
        };

    return NextResponse.json({
      execution_source: "live_llm",
      provider: "kimi",
      model: moonshotModel,
      usage: {
        raw_trace: rawRun.usage,
        compressed_state: compressedRun.usage,
      },
      task,
      room_case: "product_research_collaboration_tools_v1",
      trace_source: upstreamTraceUsable ? "beat2_real_producer_trace" : "regenerated_producer_trace",
      rows,
      token_savings: {
        raw_trace_tokens: rawTokens,
        compressed_state_tokens: compressedTokens,
        saved_tokens: savedTokens,
        saved_percent: savedPercent,
        measured,
        measurement_note: measured
          ? "两跑均取自 provider 上报的 usage.total_tokens。"
          : "provider 未回传 usage，本次为按字符数估算（chars / 3.5），仅供参考。",
      },
      decision_consistent: decisionConsistent,
      basis_identical: basisIdentical,
      shared_basis_fields: sharedBasisFields,
      verdict,
      playbook_preview: {
        title: decisionConsistent ? "same task, smaller payload, same decision" : "compression changed the decision",
        // 只有 contract 通过、决策一致、且确实省了 token，才值得写回。
        should_writeback: validation.passed && decisionConsistent && savedTokens > 0,
        blocked_reason: !validation.passed
          ? `artifact contract 未通过（缺 ${validation.missing_fields.join(", ")}），不写 playbook。`
          : !decisionConsistent
            ? "两跑决策不一致，压缩策略未被证明安全，不写 playbook。"
            : savedTokens <= 0
              ? "本次压缩没有带来 token 收益，没有复用价值。"
              : null,
        next_run_rule: decisionConsistent
          ? "下次同类任务优先复用 compressed state + artifact 清单，不再回传 raw trace。"
          : "下次同类任务先扩充 artifact_contract 的必填字段，再谈压缩。",
        reuse_benefit:
          savedTokens > 0
            ? `把第一次协作的判断结果压成可复用 playbook，下次少付约 ${savedTokens} tokens。`
            : "本次未产生可复用的 token 收益。",
      },
    } satisfies ProtocolComparisonResponse);
  } catch (error) {
    return NextResponse.json(
      {
        status: "protocol_ab_error",
        message: error instanceof Error ? error.message : "Protocol A/B failed.",
      },
      { status: 500 },
    );
  }
}
