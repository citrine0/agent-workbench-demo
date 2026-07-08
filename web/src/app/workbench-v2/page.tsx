"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileJson2,
  GitBranch,
  Loader2,
  Play,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type ApiState<T> = {
  status: "idle" | "loading" | "success" | "error";
  data?: T;
  error?: string;
};

type RunId = "route" | "skill" | "certification" | "task_room";

type RegistryUnit = {
  id: string;
  label: string;
  type: "skill" | "agent";
  capabilities: string[];
  trust_tier: string;
  trust_evidence: string;
  verified_scope: string[];
  execution_mode: string;
  blocked_actions: string[];
  human_checkpoint_policy: string;
  memory_writeback_policy: string;
};

type RegistryResponse = {
  registry: {
    version: string;
    trust_model: {
      principle: string;
      propagation_rule?: string[];
    };
    skills: RegistryUnit[];
    agents: RegistryUnit[];
  };
};

type RouteResponse = {
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
  registry_principle: string;
};

type BossSkillResponse = {
  execution_source: "real_skill_run";
  data_source: "sample";
  skill_id: string;
  trust_tier: string;
  verified_scope: string[];
  artifact: {
    ranked_jobs: Record<string, unknown>[];
    score_breakdown: {
      source_id: string;
      title: string;
      company: string;
      score: number;
      score_breakdown: Record<string, unknown>;
      risk_flags: string[];
    }[];
    resume_evidence_map: {
      source_id: string;
      title: string;
      resume_evidence: string[];
      gaps: string[];
    }[];
    blocked_actions: string[];
    human_checkpoints: string[];
    writeback_preview: Record<string, unknown>;
  };
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

const defaultMission = "帮我判断 BOSS 上 AI产品经理岗位是否匹配，并给出简历证据";

const runMeta: Record<
  RunId,
  {
    title: string;
    subtitle: string;
    label: string;
  }
> = {
  route: {
    title: "Header / Controller 路由",
    subtitle: "Header 只判断能力需求；Controller 从统一 registry 中确定性 resolve 执行方式。",
    label: "路由",
  },
  skill: {
    title: "已认证 Skill E2E",
    subtitle: "boss_job_fit_skill 调用真实 Python workflow，使用离线 sample 数据跑通端到端结果。",
    label: "真实 skill",
  },
  certification: {
    title: "Product Critic 认证",
    subtitle: "DeepSeek 作为被测 agent，经过确定性 scorer 与 Kimi judge 双层评测。",
    label: "live 评测",
  },
  task_room: {
    title: "Task Room 计划视图",
    subtitle: "只展示 artifact-first 的 room 计划，不宣称已经执行 multi-agent room。",
    label: "计划态",
  },
};

export default function WorkbenchV2Page() {
  const [mission, setMission] = useState(defaultMission);
  const [activeRun, setActiveRun] = useState<RunId>("route");
  const [registry, setRegistry] = useState<ApiState<RegistryResponse>>({ status: "idle" });
  const [route, setRoute] = useState<ApiState<RouteResponse>>({ status: "idle" });
  const [bossSkill, setBossSkill] = useState<ApiState<BossSkillResponse>>({ status: "idle" });
  const [cert, setCert] = useState<ApiState<CertResponse>>({ status: "idle" });
  const [humanApproved, setHumanApproved] = useState(false);

  useEffect(() => {
    void requestJson<RegistryResponse>("/api/workbench-v2/registry", { method: "GET" }, setRegistry);
  }, []);

  const truthRows = useMemo(
    () => [
      ["Header 路由", route.status === "success" ? "live_llm / DeepSeek" : "未运行"],
      ["Controller 规划", route.status === "success" ? "deterministic" : "未运行"],
      ["Skill 执行", bossSkill.status === "success" ? "real / Python skill" : "未运行"],
      ["Product Critic Agent", cert.status === "success" ? "live_llm / DeepSeek" : "未运行"],
      ["认证 scorer", cert.status === "success" ? "deterministic" : "未运行"],
      ["认证 judge", cert.status === "success" ? "live_llm / Kimi" : "未运行"],
      ["Task Room", "planned / 未执行"],
    ],
    [route.status, bossSkill.status, cert.status],
  );

  const queue = useMemo(
    () => [
      buildQueueItem("route", route.status, route.data?.controller.resolved_runtime),
      buildQueueItem("skill", bossSkill.status, bossSkill.data?.execution_source),
      buildQueueItem(
        "certification",
        cert.status,
        cert.data?.promotion.status ?? cert.data?.scorer.type,
      ),
      buildQueueItem("task_room", "success", "planned / 未执行"),
    ],
    [route.status, route.data, bossSkill.status, bossSkill.data, cert.status, cert.data],
  );

  function runRoute() {
    setActiveRun("route");
    void requestJson<RouteResponse>(
      "/api/workbench-v2/route",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: mission }),
      },
      setRoute,
    );
  }

  function runBossSkill() {
    setActiveRun("skill");
    void requestJson<BossSkillResponse>(
      "/api/workbench-v2/run-boss-skill",
      { method: "POST" },
      setBossSkill,
    );
  }

  function runCertification() {
    setActiveRun("certification");
    setHumanApproved(false);
    void requestJson<CertResponse>(
      "/api/workbench-v2/certify-agent",
      { method: "POST" },
      setCert,
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f6f2] text-zinc-950">
      <section className="mx-auto flex w-full max-w-[1480px] flex-col gap-4 px-4 py-4 lg:px-6">
        <Hero />

        <CollapsibleTrustConsole registry={registry} truthRows={truthRows} />

        <section className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <RunQueue
            activeRun={activeRun}
            queue={queue}
            onSelect={setActiveRun}
          />

          <ActivePipeline
            activeRun={activeRun}
            mission={mission}
            setMission={setMission}
            route={route}
            bossSkill={bossSkill}
            cert={cert}
            humanApproved={humanApproved}
            setHumanApproved={setHumanApproved}
            registry={registry.data?.registry}
            onRunRoute={runRoute}
            onRunSkill={runBossSkill}
            onRunCertification={runCertification}
          />
        </section>
      </section>
    </main>
  );
}

function buildQueueItem(id: RunId, status: ApiState<unknown>["status"], detail?: string) {
  return {
    id,
    status,
    detail: detail ?? (status === "idle" ? "待运行" : statusLabel(status)),
  };
}

function statusLabel(status: ApiState<unknown>["status"]) {
  if (status === "idle") return "待运行";
  if (status === "loading") return "运行中";
  if (status === "success") return "完成";
  return "错误";
}

function Hero() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
            <ShieldCheck className="h-3.5 w-3.5" />
            Workbench v2 可信执行切片
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            队列式运行、流水线执行、信任控制台
          </h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-600">
            Registry 只代表可发现，不代表可信。信任必须通过评测和人审晋升获得。
            这个视图把运行队列、当前流水线和信任证据分开展示。
          </p>
        </div>
        <Badge variant="outline" className="rounded-md border-zinc-300 bg-zinc-50 text-zinc-700">
          旧 Task Room 页面保留为 legacy
        </Badge>
      </div>
    </section>
  );
}

function RunQueue({
  activeRun,
  queue,
  onSelect,
}: {
  activeRun: RunId;
  queue: ReturnType<typeof buildQueueItem>[];
  onSelect: (run: RunId) => void;
}) {
  return (
    <aside className="h-fit rounded-xl border border-zinc-200 bg-white p-3 shadow-sm xl:sticky xl:top-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold">运行队列</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          选择一个 run，中间区域只展示该 run 的当前流水线。
        </p>
      </div>
      <div className="space-y-2">
        {queue.map((item, index) => {
          const meta = runMeta[item.id];
          const selected = activeRun === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={[
                "w-full rounded-lg border p-3 text-left transition",
                selected
                  ? "border-zinc-900 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-400",
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={selected ? "text-xs text-zinc-300" : "text-xs text-zinc-500"}>
                  {String(index + 1).padStart(2, "0")} · {meta.label}
                </span>
                <RunStatusBadge status={item.status} selected={selected} />
              </div>
              <div className="mt-1 text-sm font-semibold">{meta.title}</div>
              <div className={selected ? "mt-1 text-xs text-zinc-300" : "mt-1 text-xs text-zinc-500"}>
                {item.detail}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ActivePipeline({
  activeRun,
  mission,
  setMission,
  route,
  bossSkill,
  cert,
  humanApproved,
  setHumanApproved,
  registry,
  onRunRoute,
  onRunSkill,
  onRunCertification,
}: {
  activeRun: RunId;
  mission: string;
  setMission: (mission: string) => void;
  route: ApiState<RouteResponse>;
  bossSkill: ApiState<BossSkillResponse>;
  cert: ApiState<CertResponse>;
  humanApproved: boolean;
  setHumanApproved: (approved: boolean) => void;
  registry?: RegistryResponse["registry"];
  onRunRoute: () => void;
  onRunSkill: () => void;
  onRunCertification: () => void;
}) {
  const meta = runMeta[activeRun];
  return (
    <section className="min-w-0 rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 p-4">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h2 className="text-lg font-semibold">{meta.title}</h2>
            <p className="mt-1 text-sm leading-6 text-zinc-500">{meta.subtitle}</p>
          </div>
          <Badge variant="outline" className="w-fit rounded-md border-zinc-300 bg-zinc-50 text-zinc-700">
            {meta.label}
          </Badge>
        </div>
      </div>

      {activeRun === "route" ? (
        <RoutePipeline
          mission={mission}
          setMission={setMission}
          state={route}
          onRun={onRunRoute}
        />
      ) : null}
      {activeRun === "skill" ? <SkillPipeline state={bossSkill} onRun={onRunSkill} /> : null}
      {activeRun === "certification" ? (
        <CertificationPipeline
          state={cert}
          humanApproved={humanApproved}
          setHumanApproved={setHumanApproved}
          onRun={onRunCertification}
        />
      ) : null}
      {activeRun === "task_room" ? <TaskRoomPipeline registry={registry} /> : null}
    </section>
  );
}

function RoutePipeline({
  mission,
  setMission,
  state,
  onRun,
}: {
  mission: string;
  setMission: (mission: string) => void;
  state: ApiState<RouteResponse>;
  onRun: () => void;
}) {
  const stages = [
    ["输入", "用户目标"],
    ["Header", state.status === "success" ? "live_llm / DeepSeek" : "未运行"],
    ["Controller", state.status === "success" ? "deterministic resolve" : "未运行"],
    ["信任闸", state.data?.controller.trust_tier ?? "待判断"],
  ];
  return (
    <PipelineShell stages={stages} state={state}>
      <textarea
        value={mission}
        onChange={(event) => setMission(event.target.value)}
        className="min-h-24 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 outline-none transition focus:border-zinc-500 focus:bg-white"
      />
      <div className="mt-3">
        <Button type="button" onClick={onRun} disabled={state.status === "loading"}>
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          运行 live Header 路由
        </Button>
      </div>
      <StateBlock state={state}>
        {state.data ? <RouteResult data={state.data} /> : null}
      </StateBlock>
    </PipelineShell>
  );
}

function SkillPipeline({
  state,
  onRun,
}: {
  state: ApiState<BossSkillResponse>;
  onRun: () => void;
}) {
  const stages = [
    ["Controller", "verified_skill"],
    ["Python Skill", state.status === "success" ? "real" : "未运行"],
    ["Artifact", state.status === "success" ? "岗位排序结果" : "待生成"],
    ["人审闸", "外部动作已阻断"],
  ];
  return (
    <PipelineShell stages={stages} state={state}>
      <p className="text-sm leading-6 text-zinc-600">
        稳定、高频、流程明确的任务走 verified skill，不开 Task Room。数据源是离线 sample：
        不登录 BOSS、不联系招聘方、不自动投递。
      </p>
      <div className="mt-3">
        <Button type="button" onClick={onRun} disabled={state.status === "loading"}>
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          运行 boss_job_fit_skill
        </Button>
      </div>
      <StateBlock state={state}>
        {state.data ? <BossSkillResult data={state.data} /> : null}
      </StateBlock>
    </PipelineShell>
  );
}

function CertificationPipeline({
  state,
  humanApproved,
  setHumanApproved,
  onRun,
}: {
  state: ApiState<CertResponse>;
  humanApproved: boolean;
  setHumanApproved: (approved: boolean) => void;
  onRun: () => void;
}) {
  const stages = [
    ["评测集", "3 个 benchmark case"],
    ["被测 Agent", state.status === "success" ? "DeepSeek live" : "未运行"],
    ["Scorer", state.status === "success" ? "deterministic" : "未运行"],
    ["Judge", state.status === "success" ? "Kimi live" : "未运行"],
    ["晋升", humanApproved ? "页面态 scoped verified" : "等待人审"],
  ];
  return (
    <PipelineShell stages={stages} state={state}>
      <p className="text-sm leading-6 text-zinc-600">
        Product Critic 在通过 live benchmark 前只是 declared。DeepSeek 是被测 agent；
        Kimi/Moonshot 是独立 judge。即使评测通过，晋升仍需要人审确认。
      </p>
      <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950">
        Eval type: contract compliance, not blind quality。当前评测验证 agent 是否遵守输出 contract、
        覆盖 required terms、避开 forbidden recommendations；不宣称证明泛化判断能力。
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={onRun} disabled={state.status === "loading"}>
          {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          运行 live 认证
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={state.status !== "success" || state.data?.promotion.status !== "eligible_for_human_approval"}
          onClick={() => setHumanApproved(true)}
        >
          <CheckCircle2 className="h-4 w-4" />
          人审通过 scoped promotion
        </Button>
      </div>
      <StateBlock state={state}>
        {state.data ? <CertificationResult data={state.data} humanApproved={humanApproved} /> : null}
      </StateBlock>
    </PipelineShell>
  );
}

function TaskRoomPipeline({ registry }: { registry?: RegistryResponse["registry"] }) {
  const stages = [
    ["能力需求", "capability gaps"],
    ["Declared Agents", "未认证"],
    ["Artifacts", "仅 contract"],
    ["人审闸", "必须"],
  ];
  return (
    <PipelineShell stages={stages} state={{ status: "success" }}>
      <TaskRoomPlannedView registry={registry} />
    </PipelineShell>
  );
}

function PipelineShell<T>({
  stages,
  state,
  children,
}: {
  stages: string[][];
  state: ApiState<T>;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4">
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-5">
        {stages.map(([label, value], index) => (
          <div key={`${label}-${index}`} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs text-zinc-500">{label}</div>
            <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-4">
        {state.status === "loading" ? <Progress value={58} className="mb-4 h-1" /> : null}
        {children}
      </div>
    </div>
  );
}

function CollapsibleTrustConsole({
  registry,
  truthRows,
}: {
  registry: ApiState<RegistryResponse>;
  truthRows: string[][];
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <details className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-zinc-500" />
            信任控制台
          </span>
          <span className="text-xs text-zinc-500">点击查看</span>
        </summary>
        <div className="mt-3 space-y-2">
          {truthRows.map(([layer, status]) => (
            <div
              key={layer}
              className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
            >
              <span className="font-medium text-zinc-800">{layer}</span>
              <span className="text-zinc-600">{status}</span>
            </div>
          ))}
        </div>
      </details>

      <details className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <FileJson2 className="h-4 w-4 text-zinc-500" />
            统一 Registry
          </span>
          <span className="text-xs text-zinc-500">点击查看</span>
        </summary>
        <div className="mt-3">
          <StateBlock state={registry}>
            {registry.data ? <RegistrySummary data={registry.data} /> : null}
          </StateBlock>
        </div>
      </details>
    </section>
  );
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  setState: (state: ApiState<T>) => void,
) {
  setState({ status: "loading" });
  try {
    const response = await fetch(url, init);
    const payload = await response.json();
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

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-100 text-zinc-600">
          {icon}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StateBlock<T>({ state, children }: { state: ApiState<T>; children: React.ReactNode }) {
  if (state.status === "idle") return null;
  if (state.status === "loading") {
    return (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        正在运行...
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" />
          错误
        </div>
        <p className="mt-2">{state.error}</p>
      </div>
    );
  }
  return <div className="mt-3">{children}</div>;
}

function RouteResult({ data }: { data: RouteResponse }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Fact label="Header 来源" value={`${data.header.source} / ${data.header.provider}`} />
      <Fact label="Header 路由" value={data.header.decision.route} />
      <Fact label="Controller" value={data.controller.source} />
      <Fact label="Resolved runtime" value={data.controller.resolved_runtime} />
      <Fact label="选中单元" value={data.controller.selected_unit ?? "无"} />
      <Fact label="信任层级" value={data.controller.trust_tier ?? "无"} />
      <ListBlock title="所需能力" items={data.header.decision.required_capabilities} />
      <ListBlock title="信任警告" items={data.controller.trust_warnings} />
    </div>
  );
}

function BossSkillResult({ data }: { data: BossSkillResponse }) {
  const topJobs = data.artifact.score_breakdown.slice(0, 5);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Fact label="执行来源" value={data.execution_source} />
        <Fact label="信任层级" value={data.trust_tier} />
        <Fact label="数据源" value={data.data_source} />
      </div>
      <ListBlock title="已验证范围" items={data.verified_scope} />
      <div className="rounded-lg border border-zinc-200">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700">
          <span>岗位</span>
          <span>公司</span>
          <span>分数</span>
        </div>
        {topJobs.map((job) => (
          <div
            key={job.source_id}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_64px] border-b border-zinc-100 px-3 py-2 text-xs last:border-b-0"
          >
            <span className="truncate">{job.title}</span>
            <span className="truncate">{job.company}</span>
            <span>{job.score}</span>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ListBlock title="已阻断动作" items={data.artifact.blocked_actions} />
        <ListBlock title="人审节点" items={data.artifact.human_checkpoints} />
      </div>
      <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <summary className="cursor-pointer text-sm font-semibold">简历证据映射 + 写回预览</summary>
        <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-zinc-950 p-3 text-xs leading-5 text-zinc-50">
          {JSON.stringify(
            {
              resume_evidence_map: data.artifact.resume_evidence_map,
              writeback_preview: data.artifact.writeback_preview,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function CertificationResult({
  data,
  humanApproved,
}: {
  data: CertResponse;
  humanApproved: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <Fact label="被测 agent" value={`${data.tested_agent.agent_id} / ${data.tested_agent.provider}`} />
        <Fact label="当前层级" value={data.tested_agent.current_tier} />
        <Fact label="Scorer" value={data.scorer.passed ? "通过" : "未通过"} />
        <Fact label="Judge" value={`${data.judge.provider} / ${data.judge.promotion_risk}`} />
      </div>
      <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950">
        当前结果只代表 contract compliance：字段完整、required terms 覆盖、没有命中 forbidden recommendations。
        这不是 blind quality eval，不能证明该 agent 在开放产品评审中全面可靠。
      </div>
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-600">
        {data.judge.summary}
      </div>
      <div className="grid gap-3">
        {data.scorer.case_results.map((item) => (
          <div key={item.case_id} className="rounded-lg border border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.case_id}</h3>
              <Badge
                variant="outline"
                className={
                  item.deterministic_score.passed
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-red-300 bg-red-50 text-red-700"
                }
              >
                {item.deterministic_score.passed ? "通过" : "未通过"}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.artifact.recommendation}</p>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <ListBlock title="风险" items={item.artifact.risks} />
              <ListBlock title="反方意见" items={item.artifact.counterarguments} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <div className="text-sm font-semibold text-amber-950">人审晋升闸</div>
        <p className="mt-2 text-sm leading-6 text-amber-900">
          状态：{humanApproved ? "页面态 scoped verified" : data.promotion.status}。
          是否允许写回 registry：{data.promotion.registry_writeback_allowed ? "是" : "否"}。
        </p>
        <ListBlock title="建议 verified 范围" items={data.promotion.verified_scope} />
      </div>
    </div>
  );
}

function RegistrySummary({ data }: { data: RegistryResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-zinc-600">{data.registry.trust_model.principle}</p>
      <div className="grid gap-2">
        {[...data.registry.skills, ...data.registry.agents].map((unit) => (
          <div key={unit.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs leading-5 text-zinc-600">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-zinc-900">{unit.label}</span>
              <span>{unit.trust_tier} · {unit.execution_mode}</span>
            </div>
            <p className="mt-1">{unit.trust_evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskRoomPlannedView({ registry }: { registry?: RegistryResponse["registry"] }) {
  const declaredAgents = registry?.agents.filter((agent) => agent.trust_tier === "declared") ?? [];
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-zinc-600">
        Task Room 在 v2 中只展示 planned / 未执行状态。这里展示能力需求、declared agents、
        artifact contract、信任警告和人审节点，不宣称已经完成 multi-agent 执行。
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Fact label="状态" value="planned / 未执行" />
        <Fact label="Artifact contract" value="brief -> critique -> conflict log -> decision" />
        <Fact label="人审闸" value="最终建议 + 写回" />
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
        未认证 · 需人审 · 不可写 memory · 不可污染 verified 链路
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {declaredAgents.map((agent) => (
          <div key={agent.id} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-sm font-semibold">{agent.label}</div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{agent.trust_evidence}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <h4 className="text-sm font-semibold">{title}</h4>
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

function RunStatusBadge({
  status,
  selected,
}: {
  status: ApiState<unknown>["status"];
  selected: boolean;
}) {
  const label = statusLabel(status);
  return (
    <span
      className={[
        "rounded-md px-2 py-1 text-xs",
        selected
          ? "bg-white/10 text-zinc-200"
          : status === "success"
            ? "bg-emerald-50 text-emerald-800"
            : status === "error"
              ? "bg-red-50 text-red-700"
              : status === "loading"
                ? "bg-amber-50 text-amber-800"
                : "bg-zinc-100 text-zinc-500",
      ].join(" ")}
    >
      {label}
    </span>
  );
}
