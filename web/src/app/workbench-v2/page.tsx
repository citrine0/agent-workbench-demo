"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileJson2,
  GitBranch,
  Layers3,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCcw,
  Route,
  ShieldCheck,
  Sparkles,
  Split,
  Users,
  Workflow,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type {
  ArtifactHandoffResponse,
  ArtifactContractDefinition,
  ProtocolComparisonResponse,
  RegistryUnit,
  RouteExplanation,
} from "@/lib/workbench-v2";

type ApiState<T> = {
  status: "idle" | "loading" | "success" | "error";
  data?: T;
  error?: string;
};

type RegistryResponse = {
  registry: {
    version: string;
    trust_model: {
      principle: string;
      propagation_rule?: string[];
    };
    artifact_contract: ArtifactContractDefinition;
    skills: RegistryUnit[];
    agents: RegistryUnit[];
  };
};

type RouteResponse = {
  task: string;
  header: {
    source: "live_llm";
    provider: "deepseek";
    model: string;
    decision: {
      route: string;
      execution_required: boolean;
      required_capabilities: string[];
      constraints: string[];
      unknowns: string[];
      approval_boundary: string[];
      blocked_actions: string[];
      direct_answer: string | null;
    };
  };
  controller: {
    source: "deterministic";
    resolved_runtime: string;
    selected_unit: string | null;
    trust_tier: string | null;
    execution_mode: string;
    room_required: boolean;
    human_checkpoints: string[];
    trust_warnings: string[];
    selected_unit_detail?: RegistryUnit;
  };
  route_explanation: RouteExplanation;
  registry_principle: string;
};

type CertResponse = {
  execution_source: "live_llm";
  tested_agent: {
    agent_id: string;
    provider: "deepseek";
    current_tier: string;
  };
  scorer: {
    type: string;
    passed: boolean;
    case_results: {
      case_id: string;
      artifact: {
        risks: string[];
        counterarguments: string[];
        recommendation: string;
        human_review_questions: string[];
      };
      deterministic_score: {
        passed: boolean;
        missing_terms: string[];
        forbidden_hits: string[];
        required_fields_present: boolean;
      };
    }[];
  };
  judge: {
    provider: "moonshot";
    role: string;
    summary: string;
    concerns: string[];
    promotion_risk: string;
  };
  promotion: {
    status: string;
    recommended_tier: string;
    verified_scope: string[];
    human_approval_required: boolean;
    registry_writeback_allowed: boolean;
  };
};

type AdmissionCaseId = "no_room" | "room";

type PreviewDecision = {
  route: "direct_answer" | "skill" | "single_agent" | "task_room" | "header_gate_escalation";
  execution_required: boolean;
  required_capabilities: string[];
  constraints: string[];
  unknowns: string[];
  approval_boundary: string[];
  blocked_actions: string[];
  direct_answer: string | null;
};

type PreviewControllerPlan = {
  resolved_runtime: string;
  selected_unit: string | null;
  trust_tier: string | null;
  execution_mode: string;
  room_required: boolean;
  selected_unit_detail?: RegistryUnit;
};

type RoutePreview = {
  decision: PreviewDecision;
  controller: PreviewControllerPlan;
  explanation: RouteExplanation;
};

type AdmissionCase = {
  id: AdmissionCaseId;
  label: string;
  title: string;
  task: string;
  summary: string;
};

const ADMISSION_CASES: Record<AdmissionCaseId, AdmissionCase> = {
  no_room: {
    id: "no_room",
    label: "Default",
    title: "不该开 room",
    task: "帮我判断 BOSS 上 AI 产品经理岗位是否匹配，并给出简历证据",
    summary: "稳定岗位匹配可由 verified skill 覆盖，没必要把上下文扩成 room。",
  },
  room: {
    id: "room",
    label: "Contrast",
    title: "该开 room",
    task: "研究 Linear、Slack、飞书、Paperclip、Symphony，判断 Agent 如何进入协作工作流，并输出 guardrails、human-in-the-loop 和面试观点。",
    summary: "需要多 artifact 合并、上下文压缩和最小可信团队。",
  },
};

const CANONICAL_ROOM_TASK = {
  label: "Canonical room case",
  title: "product_research_collaboration_tools_v1.md",
  task: "研究 Linear、Slack、飞书、Paperclip、Symphony，判断 Agent 如何进入协作工作流，并输出 guardrails、human-in-the-loop 和面试观点。",
};

function inferPreviewDecision(task: string): PreviewDecision {
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

  if (/linear|slack|飞书|paperclip|symphony|research|产品|发布|launch|room|协作|竞品/.test(text)) {
    return {
      route: "task_room",
      execution_required: true,
      required_capabilities: ["task_room_planning", "product_critique"],
      constraints: ["只开最小 room", "artifact-first", "不传 raw trace"],
      unknowns: ["部分产品证据需要人工确认"],
      approval_boundary: ["最终建议", "外部动作", "memory 写回"],
      blocked_actions: ["open_ended_swarm", "claim_verified_without_eval"],
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

  return {
    route: "direct_answer",
    execution_required: false,
    required_capabilities: [],
    constraints: [],
    unknowns: [],
    approval_boundary: [],
    blocked_actions: [],
    direct_answer: "这个问题可以直接回答，不需要进入 Controller 执行。",
  };
}

function resolvePreviewController(decision: PreviewDecision, registry: RegistryResponse["registry"]): PreviewControllerPlan {
  if (!decision.execution_required || decision.route === "direct_answer") {
    return {
      resolved_runtime: "direct_answer",
      selected_unit: null,
      trust_tier: null,
      execution_mode: "none",
      room_required: false,
    };
  }

  if (decision.required_capabilities.includes("job_fit_scoring")) {
    const unit = registry.skills.find((item) => item.id === "boss_job_fit_skill");
    return {
      resolved_runtime: "verified_skill",
      selected_unit: unit?.id ?? null,
      trust_tier: unit?.trust_tier ?? null,
      execution_mode: unit?.execution_mode ?? "none",
      room_required: false,
      selected_unit_detail: unit,
    };
  }

  if (decision.required_capabilities.includes("product_critique") && decision.route !== "task_room") {
    const unit = registry.agents.find((item) => item.id === "product_critic_agent");
    return {
      resolved_runtime: "declared_agent",
      selected_unit: unit?.id ?? null,
      trust_tier: unit?.trust_tier ?? null,
      execution_mode: unit?.execution_mode ?? "planned",
      room_required: false,
      selected_unit_detail: unit,
    };
  }

  return {
    resolved_runtime: "task_room_plan",
    selected_unit: "planned_task_room",
    trust_tier: "declared",
    execution_mode: "planned",
    room_required: true,
  };
}

function buildPreviewExplanation(decision: PreviewDecision, registry: RegistryResponse["registry"]): RouteExplanation {
  const controller = resolvePreviewController(decision, registry);
  const selectedUnit = controller.selected_unit_detail;
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
      reasons: ["任务可以由单步判断覆盖。", "不需要多 artifact 合并。"],
      blocked_actions: decision.blocked_actions,
      excluded_agents: excludedAgents,
      decision_basis_fields: ["route", "execution_required", "required_capabilities", "blocked_actions"],
    };
  }

  if (selectedUnit?.trust_tier === "verified") {
    return {
      room_decision: "do_not_open_room",
      headline: `使用已验证能力：${selectedUnit.label}`,
      reasons: ["已有 verified skill 覆盖主要工作。", "继续开 room 只会增加 token 成本和合并成本。"],
      blocked_actions: selectedUnit.blocked_actions,
      excluded_agents: excludedAgents,
      decision_basis_fields: ["route", "required_capabilities", "trust_tier", "verified_scope"],
    };
  }

  if (controller.room_required) {
    return {
      room_decision: "open_room",
      headline: "任务需要最小可信团队和 artifact 交接。",
      reasons: ["任务需要多个结构化 artifact 合并。", "单 agent 无法同时承担判断、交接和复核。"],
      blocked_actions: [...decision.blocked_actions, ...excludedAgents.flatMap((agent) => agent.blocked_actions)],
      excluded_agents: excludedAgents,
      decision_basis_fields: ["route", "required_capabilities", "unknowns", "approval_boundary", "blocked_actions"],
    };
  }

  return {
    room_decision: "do_not_open_room",
    headline: "单个 declared agent 足够，先过 checkpoint 再谈晋升。",
    reasons: ["当前任务是批判和边界判断，不是多 agent 探索。", "先验证协议，再决定是否需要更多协作带宽。"],
    blocked_actions: selectedUnit?.blocked_actions ?? decision.blocked_actions,
    excluded_agents: excludedAgents,
    decision_basis_fields: ["route", "required_capabilities", "trust_tier", "human_checkpoint_policy"],
  };
}

export default function WorkbenchV2Page() {
  const [selectedAdmissionCase, setSelectedAdmissionCase] = useState<AdmissionCaseId>("no_room");
  const [registry, setRegistry] = useState<ApiState<RegistryResponse>>({ status: "idle" });
  const [route, setRoute] = useState<ApiState<RouteResponse>>({ status: "idle" });
  const [handoff, setHandoff] = useState<ApiState<ArtifactHandoffResponse>>({ status: "idle" });
  const [protocol, setProtocol] = useState<ApiState<ProtocolComparisonResponse>>({ status: "idle" });
  const [cert, setCert] = useState<ApiState<CertResponse>>({ status: "idle" });
  const [humanApproved, setHumanApproved] = useState(false);
  const [injectDefect, setInjectDefect] = useState(true);

  // Beat 1 的判断是下游的闸门，不是一句标题。只有判出 open_room，Beat 2/3 才允许执行。
  const roomOpened = selectedAdmissionCase === "room";

  const runArtifactHandoff = useCallback((injectDefect: boolean) => {
    void requestJson<ArtifactHandoffResponse>(
      "/api/workbench-v2/artifact-handoff",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: CANONICAL_ROOM_TASK.task, inject_defect: injectDefect }),
      },
      setHandoff,
    );
  }, []);

  const runProtocol = useCallback((source?: ArtifactHandoffResponse) => {
    void requestJson<ProtocolComparisonResponse>(
      "/api/workbench-v2/protocol-ab",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          source
            ? {
                task: CANONICAL_ROOM_TASK.task,
                artifact: source.artifact,
                producer_trace: source.producer_trace,
              }
            : {
                task: CANONICAL_ROOM_TASK.task,
              },
        ),
      },
      setProtocol,
    );
  }, []);

  const handoffData = handoff.data;

  useEffect(() => {
    void requestJson<RegistryResponse>("/api/workbench-v2/registry", { method: "GET" }, setRegistry);
  }, []);

  // Beat 2 只在 Beat 1 判出 open_room 后才执行。默认 case 判"不该开 room"，
  // 下游就必须真的停住——否则第一屏的"说不"只是文案。
  // 关闭 room 时的状态清空放在 onSelectCase 里，不在 effect 里级联 setState。
  useEffect(() => {
    if (!roomOpened) return;
    if (handoff.status !== "idle") return;
    runArtifactHandoff(injectDefect);
  }, [roomOpened, handoff.status, injectDefect, runArtifactHandoff]);

  useEffect(() => {
    if (!roomOpened) return;
    if (handoff.status !== "success" || !handoffData) return;
    if (protocol.status !== "idle") return;
    runProtocol(handoffData);
  }, [roomOpened, handoff.status, handoffData, protocol.status, runProtocol]);

  const registryData = registry.data?.registry;
  const admissionCase = ADMISSION_CASES[selectedAdmissionCase];
  const routePreview = useMemo<RoutePreview | null>(() => {
    if (!registryData) return null;
    const decision = inferPreviewDecision(admissionCase.task);
    return {
      decision,
      controller: resolvePreviewController(decision, registryData),
      explanation: buildPreviewExplanation(decision, registryData),
    };
  }, [admissionCase.task, registryData]);

  const routeSurface = route.data?.task === admissionCase.task
    ? {
        kind: "live" as const,
        data: route.data,
      }
    : routePreview
      ? {
          kind: "preview" as const,
          data: routePreview,
        }
      : null;

  return (
    <main className="min-h-screen bg-[#f7f5f0] text-zinc-950">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-4 py-4 lg:px-6">
        <Hero
          routeStatus={route.status}
          handoffStatus={handoff.status}
          protocolStatus={protocol.status}
          certStatus={cert.status}
          roomTask={CANONICAL_ROOM_TASK.title}
          roomOpened={roomOpened}
        />

        <AdmissionBeat
          admissionCase={admissionCase}
          registry={registry}
          routeState={route}
          routeSurface={routeSurface}
          onSelectCase={(caseId) => {
            setSelectedAdmissionCase(caseId);
            setRoute({ status: "idle" });
            // 切回"不该开 room"时，下游产物一并清空：room 没开，就不该留着上一次的 artifact。
            if (caseId !== "room") {
              setHandoff({ status: "idle" });
              setProtocol({ status: "idle" });
            }
          }}
          onRunRoute={() => {
            void requestJson<RouteResponse>(
              "/api/workbench-v2/route",
              {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ task: admissionCase.task }),
              },
              setRoute,
            );
          }}
        />

        <ArtifactHandoffBeat
          taskLabel={CANONICAL_ROOM_TASK.label}
          taskTitle={CANONICAL_ROOM_TASK.title}
          taskText={CANONICAL_ROOM_TASK.task}
          state={handoff}
          roomOpened={roomOpened}
          injectDefect={injectDefect}
          onToggleDefect={(next) => {
            setInjectDefect(next);
            setProtocol({ status: "idle" });
            runArtifactHandoff(next);
          }}
          onRun={() => {
            setProtocol({ status: "idle" });
            runArtifactHandoff(injectDefect);
          }}
        />

        <ProtocolAndTrustBeat
          protocolState={protocol}
          certState={cert}
          humanApproved={humanApproved}
          roomOpened={roomOpened}
          hasUpstreamArtifact={handoff.status === "success" && Boolean(handoff.data?.artifact)}
          onRunProtocol={() => runProtocol(handoff.data)}
          onRunCertification={() => {
            setHumanApproved(false);
            void requestJson<CertResponse>(
              "/api/workbench-v2/certify-agent",
              { method: "POST" },
              setCert,
            );
          }}
          onHumanApprove={() => setHumanApproved(true)}
        />

        <DesignLayer />
      </div>
    </main>
  );
}

function Hero({
  routeStatus,
  handoffStatus,
  protocolStatus,
  certStatus,
  roomTask,
  roomOpened,
}: {
  routeStatus: ApiState<unknown>["status"];
  handoffStatus: ApiState<unknown>["status"];
  protocolStatus: ApiState<unknown>["status"];
  certStatus: ApiState<unknown>["status"];
  roomTask: string;
  roomOpened: boolean;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-4xl space-y-3">
          <Badge variant="outline" className="rounded-md border-emerald-300 bg-emerald-50 text-emerald-900">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Agent Workbench v2
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight">
            先判断该不该开 room，再让最小可信团队产 artifact，最后把 token 省下来
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-zinc-600">
            这版只保留一条主线：room admission、artifact handoff、raw trace vs compressed state A/B、
            checkpoint + playbook。默认展示的是能复用的协作判断，不是多 agent 表演。
          </p>
        </div>

        <div className="grid min-w-[320px] gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
          <StatRow label="Room case" value={roomTask} />
          <StatRow label="Route" value={statusLabel(routeStatus)} />
          <StatRow
            label="Artifact / AB / Cert"
            value={
              roomOpened
                ? `${statusLabel(handoffStatus)} · ${statusLabel(protocolStatus)} · ${statusLabel(certStatus)}`
                : "gated · gated · gated"
            }
          />
        </div>
      </div>
    </section>
  );
}

function AdmissionBeat({
  admissionCase,
  registry,
  routeState,
  routeSurface,
  onSelectCase,
  onRunRoute,
}: {
  admissionCase: AdmissionCase;
  registry: ApiState<RegistryResponse>;
  routeState: ApiState<RouteResponse>;
  routeSurface:
    | {
        kind: "preview";
        data: RoutePreview;
      }
    | {
        kind: "live";
        data: RouteResponse;
      }
    | null;
  onSelectCase: (caseId: AdmissionCaseId) => void;
  onRunRoute: () => void;
}) {
  const isPreview = routeSurface?.kind === "preview";
  const preview = isPreview ? routeSurface.data : null;
  const live = routeSurface?.kind === "live" ? routeSurface.data : null;
  const headerDecision = live?.header.decision ?? preview?.decision;
  const routeDecision = live?.route_explanation ?? preview?.explanation;
  const controller = live?.controller ?? preview?.controller;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Beat 1</div>
            <h2 className="mt-1 text-xl font-semibold">先判断该不该开 room</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              默认停在“不该开 room”，切到右侧的 B 可以看到同一套机制如何判出相反结果。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["no_room", "room"] as AdmissionCaseId[]).map((caseId) => {
              const item = ADMISSION_CASES[caseId];
              const active = item.id === admissionCase.id;
              return (
                <Button
                  key={item.id}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className={active ? "gap-2" : "gap-2 border-zinc-300 bg-white"}
                  onClick={() => onSelectCase(item.id)}
                >
                  {caseId === "no_room" ? <LockKeyhole className="h-4 w-4" /> : <Workflow className="h-4 w-4" />}
                  {item.title}
                </Button>
              );
            })}
            <Button type="button" className="gap-2" onClick={onRunRoute} disabled={routeState.status === "loading"}>
              {routeState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run live Header
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {admissionCase.label}
              </Badge>
              <Badge
                variant="outline"
                className={
                  admissionCase.id === "no_room"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-sky-300 bg-sky-50 text-sky-900"
                }
              >
                {admissionCase.title}
              </Badge>
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-600">
                {admissionCase.summary}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700">{admissionCase.task}</p>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <MetricCard
                label="Route preview"
                value={routeDecision?.room_decision === "open_room" ? "Open Room" : "Do not open Room"}
                detail={routeDecision?.headline ?? "Waiting for registry"}
              />
              <MetricCard
                label="Controller runtime"
                value={controller?.resolved_runtime ?? "waiting"}
                detail={controller?.selected_unit ?? "registry loading"}
              />
              <MetricCard
                label="Decision basis"
                value={routeDecision?.decision_basis_fields.length ? `${routeDecision.decision_basis_fields.length} fields` : "—"}
                detail={routeDecision?.decision_basis_fields.join(" · ") ?? "no preview yet"}
              />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ListBlock title="为什么" items={routeDecision?.reasons ?? [admissionCase.summary]} />
              <ListBlock title="blocked_actions" items={routeDecision?.blocked_actions ?? []} />
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Route className="h-4 w-4 text-zinc-500" />
              Header / Controller 职责分离
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Header 不选 agent，Controller 不做判断。前者只定是否开 room，后者只把 registry 里的规则落到执行计划。
            </p>
            <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto_1fr]">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">Header</div>
                  <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                    route decision
                  </Badge>
                </div>
                <div className="mt-2 text-sm leading-6 text-zinc-700">
                  {routeDecision?.room_decision === "open_room" ? "open_room" : "do_not_open_room"}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <ListBlock
                    title="Header 输出"
                    items={[
                      `route: ${headerDecision?.route ?? "waiting"}`,
                      `required_caps: ${(headerDecision?.required_capabilities ?? []).join(", ") || "—"}`,
                      `blocked_actions: ${(headerDecision?.blocked_actions ?? []).join(", ") || "—"}`,
                    ]}
                  />
                  <ListBlock
                    title="Controller 不做"
                    items={[
                      "不选择具体 agent",
                      "不评判任务是否应该开 room",
                      `room_required: ${controller?.room_required ? "true" : "false"}`,
                    ]}
                  />
                </div>
              </div>
              <div className="flex items-center justify-center px-2 text-zinc-400">
                <ArrowRight className="h-5 w-5" />
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-zinc-900">Controller</div>
                  <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                    deterministic
                  </Badge>
                </div>
                <div className="mt-2 text-sm leading-6 text-zinc-700">
                  {controller?.resolved_runtime ?? "waiting"}
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <ListBlock
                    title="Controller 输出"
                    items={[
                      `selected_unit: ${controller?.selected_unit ?? "none"}`,
                      `trust_tier: ${controller?.trust_tier ?? "none"}`,
                      `execution_mode: ${controller?.execution_mode ?? "none"}`,
                    ]}
                  />
                  <ListBlock
                    title="Header 不做"
                    items={[
                      "不发起模型执行",
                      "不写 artifact",
                      "不做 token 计量",
                    ]}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            {routeState.status === "loading" ? <Progress value={48} className="mb-4 h-1" /> : null}
            {routeState.status === "error" ? <ErrorBox message={routeState.error ?? "Route failed."} /> : null}
            {!live && preview ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                      Preview
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        preview.explanation.room_decision === "open_room"
                          ? "border-sky-300 bg-sky-50 text-sky-900"
                          : "border-emerald-300 bg-emerald-50 text-emerald-900"
                      }
                    >
                      {preview.explanation.room_decision === "open_room" ? "Open room" : "Do not open room"}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-zinc-600">{preview.explanation.headline}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <ListBlock title="决策依据字段" items={preview.explanation.decision_basis_fields} />
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <h3 className="text-sm font-semibold">excluded agents</h3>
                    <div className="mt-3 space-y-2">
                      {preview.explanation.excluded_agents.map((agent) => (
                        <div key={agent.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-zinc-900">{agent.label}</span>
                            <Badge variant="outline" className="border-zinc-300 bg-zinc-50 text-zinc-600">
                              {agent.trust_tier}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-zinc-600">{agent.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : live ? (
              <RouteLiveResult data={live} />
            ) : (
              <EmptyState icon={<Route className="h-4 w-4" />} title="等待 route preview">
                registry 加载后，这里会先显示本地 preview，再允许你跑 live Header。
              </EmptyState>
            )}
          </section>
        </div>

        <div className="space-y-3">
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-zinc-500" />
              Registry 视角
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Registry 只代表可发现，不代表可信。当前这条主线只把信任当作判断后的结果，而不是默认前提。
            </p>
            <div className="mt-3 grid gap-2">
              <MiniStat label="Verified / Declared" value={registry.data ? `${registry.data.registry.skills.filter((item) => item.trust_tier === "verified").length} / ${registry.data.registry.agents.filter((item) => item.trust_tier === "declared").length}` : "loading"} />
              <MiniStat label="Excluded by design" value={registry.data ? `${registry.data.registry.agents.filter((item) => item.trust_tier === "excluded_by_design").length}` : "loading"} />
              <MiniStat label="Artifact contract" value={registry.data ? registry.data.registry.artifact_contract.contract_version : "loading"} />
            </div>
            <div className="mt-3">
              <ListBlock title="registry principle" items={registry.data ? [registry.data.registry.trust_model.principle] : []} />
              <div className="mt-3">
                <ListBlock
                  title="artifact contract"
                  items={registry.data ? registry.data.registry.artifact_contract.required_fields : []}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-zinc-500" />
              视觉重点
            </div>
            <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-600">
              <p>1. 默认先说“不该开 room”，而不是默认多 agent。</p>
              <p>2. 同一套判断机制切到 B，结果变成“该开 room”。</p>
              <p>3. 这不是聊天流，是决策流。</p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function ArtifactHandoffBeat({
  taskLabel,
  taskTitle,
  taskText,
  state,
  roomOpened,
  injectDefect,
  onToggleDefect,
  onRun,
}: {
  taskLabel: string;
  taskTitle: string;
  taskText: string;
  state: ApiState<ArtifactHandoffResponse>;
  roomOpened: boolean;
  injectDefect: boolean;
  onToggleDefect: (next: boolean) => void;
  onRun: () => void;
}) {
  const data = state.data;
  const checks = data?.validation.checks ?? [];

  if (!roomOpened) {
    return <GatedBeat beat="Beat 2" title="最小可信团队产 artifact" />;
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Beat 2</div>
            <h2 className="mt-1 text-xl font-semibold">最小可信团队产 artifact</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              Agent A 的 artifact 先过 contract，再进入 Agent B。默认注入一个缺陷，让校验器真的拦一次。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={injectDefect ? "default" : "outline"}
              className={injectDefect ? "gap-2" : "gap-2 border-zinc-300 bg-white"}
              onClick={() => onToggleDefect(!injectDefect)}
              disabled={state.status === "loading"}
            >
              <AlertTriangle className="h-4 w-4" />
              {injectDefect ? "注入缺陷：开" : "注入缺陷：关"}
            </Button>
            <Button type="button" className="gap-2" onClick={onRun} disabled={state.status === "loading"}>
              {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              重新跑交接
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {taskLabel}
              </Badge>
              <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-900">
                Agent A → artifact → Agent B
              </Badge>
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-600">
                {taskTitle}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700">{taskText}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {data ? data.execution_source : "waiting"}
              </Badge>
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {data ? `${data.provider} / ${data.model}` : "live Kimi pending"}
              </Badge>
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {data ? `contract ${data.artifact_contract.contract_version}` : "registry contract"}
              </Badge>
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                usage {usageSummary(data?.usage)}
              </Badge>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <MetricCard
                label="Producer · live LLM call"
                value={data?.agents.producer.label ?? "loading"}
                detail={`${data?.agents.producer.trust_tier ?? "—"} · 本 beat 唯一一次模型调用`}
              />
              <MetricCard
                label="Consumer gate · 无模型调用"
                value={data?.agents.consumer.label ?? "loading"}
                detail={data ? `${data.downstream_decision.evaluator} · ${data.downstream_decision.rule}` : "deterministic gate"}
              />
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              这一步是代码里的确定性闸门，不是第二个 agent 在思考。确定性校验本来就该是确定性的——
              把它标出来，是为了不让人误以为跑了两个 agent。
            </p>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            {state.status === "loading" ? <Progress value={62} className="mb-4 h-1" /> : null}
            {state.status === "error" ? <ErrorBox message={state.error ?? "Artifact handoff failed."} /> : null}
            {data ? <ArtifactBlock data={data.artifact} /> : <EmptyState icon={<Bot className="h-4 w-4" />} title="等待 artifact">交接结果会以结构化 artifact 的形状显示。</EmptyState>}
          </section>
        </div>

        <div className="space-y-3">
          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">contract validation</h3>
              <Badge
                variant="outline"
                className={
                  data?.validation.status === "passed"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-red-300 bg-red-50 text-red-700"
                }
              >
                {data?.validation.status ?? "pending"}
              </Badge>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <ListBlock title="required fields" items={data?.artifact_contract.required_fields ?? []} />
              <ListBlock title="missing fields" items={data?.validation.missing_fields ?? []} />
            </div>
            {data?.defect_injection.enabled ? (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
                <div className="font-semibold">已注入缺陷：{data.defect_injection.field}</div>
                <p className="mt-1">{data.defect_injection.rationale}</p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
                未注入缺陷。此时 Agent A 正常发挥就会全绿——全绿不能证明校验器存在，只能证明模型这次没出错。
              </div>
            )}
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-600">
              <div className="font-semibold text-zinc-900">{data?.validation.action ?? "pending"}</div>
              <p className="mt-1">
                Agent B 只能消费通过 contract 的结构化输入。缺字段时，先降级到 human review，而不是把缺口藏进自由对话里。
              </p>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {checks.map((check) => (
                <div key={check.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{check.label}</span>
                    <Badge
                      variant="outline"
                      className={
                        check.passed
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-red-300 bg-red-50 text-red-700"
                      }
                    >
                      {check.passed ? "pass" : "fail"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-zinc-600">{check.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold">downstream input packet</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ListBlock title="included fields" items={Object.keys(data?.downstream_input_packet.included_fields ?? {})} />
              <ListBlock title="excluded context" items={data?.downstream_input_packet.excluded_context ?? []} />
            </div>
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">packet JSON</div>
              <pre className="mt-2 max-h-72 overflow-auto text-xs leading-5 text-zinc-800">
                {JSON.stringify(data?.downstream_input_packet ?? {}, null, 2)}
              </pre>
            </div>
            <div
              className={
                data?.validation.status === "failed"
                  ? "mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950"
                  : "mt-3 rounded-lg border border-zinc-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950"
              }
            >
              <div className="font-semibold">
                downstream decision: {data?.downstream_decision.decision ?? "pending"}
                {data ? ` · ${data.downstream_decision.evaluator}` : ""}
              </div>
              <p className="mt-1">{data?.downstream_decision.note ?? "等待 contract 校验结果。"}</p>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function ProtocolAndTrustBeat({
  protocolState,
  certState,
  humanApproved,
  roomOpened,
  hasUpstreamArtifact,
  onRunProtocol,
  onRunCertification,
  onHumanApprove,
}: {
  protocolState: ApiState<ProtocolComparisonResponse>;
  certState: ApiState<CertResponse>;
  humanApproved: boolean;
  roomOpened: boolean;
  hasUpstreamArtifact: boolean;
  onRunProtocol: () => void;
  onRunCertification: () => void;
  onHumanApprove: () => void;
}) {
  const protocol = protocolState.data;
  const cert = certState.data;
  const savedTokens = protocol?.token_savings.saved_tokens ?? 0;
  const savedPercent = protocol?.token_savings.saved_percent ?? 0;
  const branchPassed = Boolean(cert?.scorer.passed && cert?.promotion.status === "eligible_for_human_approval" && humanApproved);

  if (!roomOpened) {
    return <GatedBeat beat="Beat 3" title="raw trace vs compressed state + checkpoint + playbook" />;
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Beat 3</div>
            <h2 className="mt-1 text-xl font-semibold">raw trace vs compressed state + checkpoint + playbook</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              这一步只回答两个问题：省了多少 token，以及下游决策有没有变。trust gate 默认停在 declared。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {protocol ? protocol.execution_source : "waiting"}
              </Badge>
              <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
                {protocol ? `${protocol.provider} / ${protocol.model}` : "live Kimi pending"}
              </Badge>
              <Badge
                variant="outline"
                className={hasUpstreamArtifact ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-zinc-300 bg-white text-zinc-700"}
              >
                {hasUpstreamArtifact ? "uses Beat 2 artifact" : "waiting for Beat 2 artifact"}
              </Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-2" onClick={onRunProtocol} disabled={protocolState.status === "loading" || !hasUpstreamArtifact}>
              {protocolState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Split className="h-4 w-4" />}
              重新跑 A/B
            </Button>
            <Button type="button" variant="outline" className="gap-2 border-zinc-300 bg-white" onClick={onRunCertification} disabled={certState.status === "loading"}>
              {certState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              跑 checkpoint
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <section className="grid gap-3 md:grid-cols-3">
            <MetricCard
              label="raw trace tokens"
              value={protocol ? String(protocol.token_savings.raw_trace_tokens) : "loading"}
              detail={protocol ? `Agent A 真实 prompt + 原始回复 · ${protocol.rows[0].payload_chars} chars` : "full trace"}
            />
            <MetricCard
              label="compressed tokens"
              value={protocol ? String(protocol.token_savings.compressed_state_tokens) : "loading"}
              detail={protocol ? `contract 内字段 · ${protocol.rows[1].payload_chars} chars` : "state + artifact list"}
            />
            <MetricCard
              label={savedTokens < 0 ? "额外开销" : "saved tokens"}
              value={protocol ? `${savedTokens} · ${savedPercent}%` : "loading"}
              detail={protocol ? protocol.token_savings.measurement_note : "waiting"}
            />
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            {protocolState.status === "loading" ? <Progress value={54} className="mb-4 h-1" /> : null}
            {protocolState.status === "error" ? <ErrorBox message={protocolState.error ?? "Protocol A/B failed."} /> : null}
            {protocol ? <ProtocolTable data={protocol} /> : <EmptyState icon={<Split className="h-4 w-4" />} title="等待 A/B 对比">同一任务会跑两遍：raw trace 全量回传 vs compressed state + artifact 清单。</EmptyState>}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-zinc-500" />
              Trust gate
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <TrustBranch
                title="默认分支"
                active={!branchPassed}
                tone="danger"
                body="declared → eval failed → stay declared。没有通过前，不写 memory，不进 verified 链。"
              />
              <TrustBranch
                title="通过分支"
                active={branchPassed}
                tone="success"
                body="declared → eval passed → human approved → verified。前提是 live eval 真的过，并且人审确认。"
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ListBlock
                title="当前状态"
                items={
                  cert
                    ? [
                        `agent: ${cert.tested_agent.agent_id} / ${cert.tested_agent.current_tier}`,
                        `scorer: ${cert.scorer.passed ? "passed" : "failed"}`,
                        `writeback: ${cert.promotion.registry_writeback_allowed ? "allowed" : "blocked"}`,
                      ]
                    : ["declared", "human approval required", "registry writeback blocked"]
                }
              />
              <ListBlock
                title="人审边界"
                items={
                  cert
                    ? [
                        `promotion: ${cert.promotion.status}`,
                        `verified_scope: ${cert.promotion.verified_scope.length}`,
                        `approval_required: ${cert.promotion.human_approval_required ? "yes" : "no"}`,
                      ]
                    : ["默认停在 declared", "未通过 eval 不可晋升", "只能写 preview，不写 registry"]
                }
              />
            </div>
            <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
                <ShieldCheck className="h-4 w-4" />
                Human checkpoint · 必经节点
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-amber-400 bg-white"
                  disabled={!cert || !(cert.scorer.passed && cert.promotion.status === "eligible_for_human_approval")}
                  onClick={onHumanApprove}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {humanApproved ? "已人审通过" : "人审通过"}
                </Button>
                <Badge variant="outline" className="border-amber-400 bg-white text-amber-900">
                  registry_writeback_allowed: false
                </Badge>
              </div>
              <p className="mt-3 text-xs leading-5 text-amber-950">
                这个按钮只改变界面状态。即使点了通过，registry 也不会被写——
                <code className="rounded bg-white px-1 py-0.5">registry_writeback_allowed: false</code> 写死在
                <code className="rounded bg-white px-1 py-0.5">data/workbench_registry.json</code> 与 certify 路由里。
                UI 上的确认可以被绕过，代码层的边界不能：这是 guardrails 与「确认弹窗」的区别。
              </p>
            </div>
          </section>
        </div>

        <div className="space-y-3">
          <section className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileJson2 className="h-4 w-4 text-zinc-500" />
              Playbook preview
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-700">
              {protocol?.playbook_preview.title ?? "same task, smaller payload, same decision"}
            </p>
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
              {protocol?.playbook_preview.next_run_rule ?? "下次同类任务优先复用 compressed state + artifact 清单，不再回传 raw trace。"}
            </div>
            {protocol?.playbook_preview.should_writeback ? (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                <div className="font-semibold">should_writeback: true</div>
                <p className="mt-1">下次协作少付约 {savedTokens} tokens（{savedPercent}%）。</p>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
                <div className="font-semibold">should_writeback: false</div>
                <p className="mt-1">
                  {protocol?.playbook_preview.blocked_reason ?? "等待 A/B 实测结果，未验证前不写 playbook。"}
                </p>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Certification result</h3>
              <Badge
                variant="outline"
                className={
                  cert?.scorer.passed
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-red-300 bg-red-50 text-red-700"
                }
              >
                {cert ? (cert.scorer.passed ? "passed" : "blocked") : "idle"}
              </Badge>
            </div>
            {certState.status === "loading" ? <Progress value={67} className="mt-3 h-1" /> : null}
            {certState.status === "error" ? <ErrorBox message={certState.error ?? "Certification failed."} /> : null}
            {cert ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm leading-6 text-zinc-600">{cert.judge.summary}</p>
                <details className="rounded-lg border border-zinc-200 bg-white p-3">
                  <summary className="cursor-pointer text-sm font-semibold">case results</summary>
                  <div className="mt-3 space-y-2">
                    {cert.scorer.case_results.map((item) => (
                      <div key={item.case_id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">{item.case_id}</span>
                          <Badge
                            variant="outline"
                            className={
                              item.deterministic_score.passed
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : "border-red-300 bg-red-50 text-red-700"
                            }
                          >
                            {item.deterministic_score.passed ? "pass" : "fail"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-zinc-600">{item.artifact.recommendation}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : (
              <EmptyState icon={<GitBranch className="h-4 w-4" />} title="默认停在 declared">
                现在只展示 trust gate 的失败分支。跑 live eval 后，才决定能不能进入 human approval。
              </EmptyState>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}

function RouteLiveResult({ data }: { data: RouteResponse }) {
  const decision = data.route_explanation;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Header source" value={`${data.header.source} / ${data.header.provider}`} detail={data.header.model} />
        <MetricCard label="Route" value={data.header.decision.route} detail={data.controller.resolved_runtime} />
        <MetricCard label="Controller" value={data.controller.execution_mode} detail={data.controller.selected_unit ?? "none"} />
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
            {decision.room_decision === "open_room" ? "Open room" : "Do not open room"}
          </Badge>
          <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-600">
            {data.registry_principle}
          </Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-700">{decision.headline}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ListBlock title="reasoning" items={decision.reasons} />
          <ListBlock title="blocked_actions" items={decision.blocked_actions} />
        </div>
      </div>
      <details className="rounded-xl border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">live route JSON</summary>
        <pre className="mt-3 max-h-72 overflow-auto text-xs leading-5 text-zinc-800">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function ArtifactBlock({ data }: { data: ArtifactHandoffResponse["artifact"] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
            {data.contract_version}
          </Badge>
          <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-900">
            {data.producer_agent}
          </Badge>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-700">{data.judgment}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ListBlock title="evidence" items={data.evidence} />
        <ListBlock title="blocked_actions" items={data.blocked_actions} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ListBlock title="missing_information" items={data.missing_information} />
        <ListBlock title="risk_register" items={data.risk_register} />
      </div>
      <details className="rounded-lg border border-zinc-200 bg-zinc-950 p-3 text-zinc-50">
        <summary className="cursor-pointer text-sm font-semibold">artifact JSON</summary>
        <pre className="mt-3 max-h-72 overflow-auto text-xs leading-5 text-zinc-50">{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  );
}

/**
 * Beat 1 判"不该开 room"时，下游 beat 真的不执行。
 * 这一屏的存在本身就是证据：第一屏的"说不"不是文案，是闸门。
 */
function GatedBeat({ beat, title }: { beat: string; title: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">{beat}</div>
          <h2 className="mt-1 text-xl font-semibold text-zinc-500">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Beat 1 判定 <span className="font-semibold text-zinc-900">do_not_open_room</span>，本屏不执行，也不发起任何模型调用。
            要看这一段，请在上面切到对照任务 B。
          </p>
        </div>
        <Badge variant="outline" className="w-fit border-zinc-400 bg-white text-zinc-700">
          <LockKeyhole className="mr-1.5 h-3.5 w-3.5" />
          blocked by room admission
        </Badge>
      </div>
    </section>
  );
}

function ProtocolTable({ data }: { data: ProtocolComparisonResponse }) {
  const divergent = data.verdict.status === "divergent";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={
            divergent
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }
        >
          decision consistent: {data.decision_consistent ? "yes" : "no"}
        </Badge>
        <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
          basis identical: {data.basis_identical ? "yes" : "no"}
        </Badge>
        <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
          {data.token_savings.saved_tokens >= 0 ? "saved" : "extra"} {Math.abs(data.token_savings.saved_tokens)} tokens
        </Badge>
        <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
          {data.token_savings.measured ? "provider usage" : "estimated"}
        </Badge>
        <Badge variant="outline" className="border-zinc-300 bg-white text-zinc-700">
          {data.trace_source === "beat2_real_producer_trace" ? "uses Beat 2 real trace" : "regenerated trace"}
        </Badge>
      </div>
      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <div className="grid grid-cols-[1.45fr_0.7fr_0.9fr_1.4fr] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
          <span>协作方式</span>
          <span>Tokens</span>
          <span>下游决策</span>
          <span>决策依据字段</span>
        </div>
        {data.rows.map((row) => (
          <div key={row.mode} className="grid grid-cols-[1.45fr_0.7fr_0.9fr_1.4fr] border-b border-zinc-100 px-3 py-3 text-sm last:border-b-0">
            <span className="font-medium text-zinc-900">{row.label}</span>
            <span className="text-zinc-700">{row.tokens}</span>
            <span className={row.downstream_decision === "Review" ? "text-amber-700" : "text-zinc-700"}>{row.downstream_decision}</span>
            <span className="text-zinc-600">{row.decision_basis_fields.join(" · ")}</span>
          </div>
        ))}
      </div>
      <div
        className={
          divergent
            ? "rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950"
            : "rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950"
        }
      >
        <div className="font-semibold">{data.verdict.headline}</div>
        <p className="mt-1">{data.verdict.detail}</p>
      </div>
    </div>
  );
}

function DesignLayer() {
  return (
    <details className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Layers3 className="h-4 w-4 text-zinc-500" />
          设计层全景（已设计未启用）
        </span>
        <span className="text-xs text-zinc-500">点击展开</span>
      </summary>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ListBlock
          title="保留的判断力"
          items={[
            "orchestrator.py 作为完整形态的设计证据，不接 runtime。",
            "动态组队、capability gap、agent builder 只在叙事里出现，不在主线里展开。",
            "Artifact-first、guardrails、human-in-the-loop 继续保留，但只作为设计背景。",
          ]}
        />
        <ListBlock
          title="本次不再展开"
          items={[
            "外部 agent + A2A",
            "legacy 多入口",
            "开放式 swarm",
            "完整 builder 执行",
            "多条 demo 主线并行",
          ]}
        />
      </div>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
        这层的作用是说明你知道什么时候该停，而不是继续把系统做成更大的平台。
      </div>
    </details>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-zinc-900">{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-zinc-500">{detail}</div> : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
      <span className="text-xs uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <span className="font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-900">{value}</span>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <h4 className="text-sm font-semibold text-zinc-900">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-600">
          {items.map((item) => (
            <li key={item}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-zinc-400">无</p>
      )}
    </div>
  );
}

function usageSummary(usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null) {
  if (!usage) return "—";
  if (typeof usage.total_tokens === "number") return `${usage.total_tokens} tokens`;
  const promptTokens = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const completionTokens = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  const total = promptTokens + completionTokens;
  return total > 0 ? `${total} tokens` : "—";
}

function TrustBranch({
  title,
  body,
  tone,
  active,
}: {
  title: string;
  body: string;
  tone: "danger" | "success";
  active: boolean;
}) {
  return (
    <div
      className={[
        "rounded-xl border p-4 text-sm leading-6",
        active
          ? tone === "danger"
            ? "border-red-300 bg-red-50 text-red-900"
            : "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-zinc-200 bg-white text-zinc-500",
      ].join(" ")}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-1">{body}</div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm leading-6 text-zinc-600">
      <div className="flex items-center gap-2 font-semibold text-zinc-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-zinc-500">{icon}</span>
        {title}
      </div>
      <p className="mt-2">{children}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
      <div className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4" />
        错误
      </div>
      <p className="mt-2">{message}</p>
    </div>
  );
}

async function requestJson<T>(url: string, init: RequestInit, setState: (state: ApiState<T>) => void) {
  setState({ status: "loading" });
  try {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message ?? payload.error ?? `请求失败: ${response.status}`);
    }
    setState({ status: "success", data: payload as T });
  } catch (error) {
    setState({
      status: "error",
      error: error instanceof Error ? error.message : "请求失败。",
    });
  }
}

function statusLabel(status: ApiState<unknown>["status"]) {
  if (status === "idle") return "待运行";
  if (status === "loading") return "运行中";
  if (status === "success") return "完成";
  return "错误";
}
