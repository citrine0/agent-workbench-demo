import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

from agents.run_registered_agents import run_registered_agents
from llm_client import LLMClient

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
PROMPTS_DIR = BASE_DIR / "prompts"
OUTPUT_DIR = BASE_DIR / "output"

DEFAULT_SUCCESS_CRITERIA = [
    "用户能判断当前任务是否真的需要 Agent 介入",
    "用户能看到为了最终任务需要 builder 哪些 Agent",
    "用户能明确每个 Agent 的输入输出、职责边界和停止条件",
    "用户能确认哪些协作记忆可以写回，哪些必须丢弃",
]

DEFAULT_MINIMUM_COMPLETION_PATH = [
    "判断 final task 是否超出单 Agent 或 skill-heavy 路径",
    "拆解完成最终任务所需的能力缺口",
    "定义最小 Agent team 与每个 Agent 的 artifact contract",
    "定义 QA / conflict resolution / revision loop",
    "定义 human checkpoint 与 memory writeback preview",
]

DEFAULT_REQUIRED_CAPABILITIES = [
    "task_decomposition",
    "role_assignment",
    "artifact_contract",
    "qa_conflict_resolution",
    "memory_writeback",
]

DEFAULT_MINIMUM_VIABLE_TEAM = [
    {
        "agent": "Task Decomposition Agent",
        "capability": "task_decomposition",
        "why_selected": "把最终目标拆成可交付的协作单元。",
    },
    {
        "agent": "Role Assignment Agent",
        "capability": "role_assignment",
        "why_selected": "判断需要 builder 哪些 Agent，以及哪些 Agent 不该启用。",
    },
    {
        "agent": "Artifact Contract Agent",
        "capability": "artifact_contract",
        "why_selected": "定义每个 Agent 的输入、输出 schema 和证据要求。",
    },
    {
        "agent": "QA & Conflict Resolution Agent",
        "capability": "qa_conflict_resolution",
        "why_selected": "定义质检、冲突处理、返工和停止条件。",
    },
    {
        "agent": "Memory Writeback Agent",
        "capability": "memory_writeback",
        "why_selected": "把本次有效协作压缩成可复用 workflow / policy memory。",
    },
]

PRODUCT_RESEARCH_REQUIRED_CAPABILITIES = [
    "research_synthesis",
    "product_critique",
    "collaboration_design",
    "memory_writeback",
]

PRODUCT_RESEARCH_MINIMUM_COMPLETION_PATH = [
    "把研究目标、目标产品和证据策略转成 Room Contract",
    "由 Research Synthesis Agent 输出产品研究卡和协作机制对比表",
    "由 Product Critic Agent 挑战结论、识别局限、反例和风险",
    "由 Collaboration Designer Agent 生成 Agent 介入点、guardrails、人审节点和面试叙事",
    "展示 candidate Evaluation Agent、Room Capsule 和 playbook 写回预览",
]

PRODUCT_RESEARCH_SUCCESS_CRITERIA = [
    "用户能看到为什么这不是单个长答案或单个 Skill 能覆盖的任务",
    "每个研究结论都区分已知事实、推断和待确认信息",
    "产品优点、局限、Agent 介入点和 guardrails 能形成可判断交付物",
    "candidate Evaluation Agent 只展示规格和评测门槛，不直接注册",
    "长期 playbook 只展示预览，等待用户确认后写回",
]

PRODUCT_RESEARCH_MINIMUM_TEAM = [
    {
        "agent": "Research Synthesis Agent",
        "capability": "research_synthesis",
        "why_selected": "把 Linear、Slack、飞书、Paperclip、Symphony 等产品资料整理成可比较的协作机制 artifact。",
    },
    {
        "agent": "Product Critic Agent",
        "capability": "product_critique",
        "why_selected": "挑战研究结论，识别优点、局限、反例、风险和人审问题。",
    },
    {
        "agent": "Collaboration Designer Agent",
        "capability": "collaboration_design",
        "why_selected": "把研究和批判结果转成 Agent 介入点、guardrails、交互协议和面试叙事。",
    },
]

DEFAULT_EXCLUDED_AGENTS = [
    {
        "agent": "Open-Ended Swarm Agent",
        "why_excluded": "开放式群聊会增加噪音和 token 成本，不能保证可授权输出。",
    },
    {
        "agent": "Full Automation Agent",
        "why_excluded": "当前只需要生成协作协议与人审结果面板，不应直接全自动执行。",
    },
]

DEFAULT_AUTHORIZATION_SCOPE = {
    "allowed": [
        "生成 Agent team spec",
        "生成 artifact contract",
        "生成 workflow memory 写回预览",
    ],
    "needs_approval": [
        "保存长期协作记忆",
        "启用新的 Agent team 模板",
    ],
    "blocked": [
        "自动执行外部动作",
        "写入未经确认的长期记忆",
        "启用开放式无边界 Agent 群聊",
    ],
    "review_required": True,
}

CAPABILITY_CATALOG: Dict[str, Dict[str, Any]] = {
    "ai_coding": {
        "label": "AI Coding",
        "keywords": ["ai coding", "coding", "代码", "工程", "开发", "实现"],
        "default_radius": "inside_radius",
        "inside_why": "用户能判断实现细节与工程取舍",
    },
    "rapid_prototyping": {
        "label": "快速原型",
        "keywords": ["原型", "prototyp", "mvp"],
        "default_radius": "inside_radius",
        "inside_why": "用户擅长快速验证并收敛方案",
    },
    "task_decomposition": {
        "label": "任务拆解",
        "keywords": ["拆解", "decomposition", "final task", "最终任务", "复杂任务"],
        "default_radius": "outside_radius",
        "outside_why": "复杂任务需要先拆成可交付单元，避免 Agent 直接长回答",
    },
    "role_assignment": {
        "label": "角色分配",
        "keywords": ["agent team", "role", "角色", "分工", "builder", "构建"],
        "default_radius": "outside_radius",
        "outside_why": "需要判断哪些 Agent 会改变结果，哪些只是增加噪音",
    },
    "artifact_contract": {
        "label": "产物合约",
        "keywords": ["contract", "schema", "artifact", "输入输出", "产物"],
        "default_radius": "outside_radius",
        "outside_why": "Agent 协作需要结构化输入输出，否则难以合并和复核",
    },
    "qa_conflict_resolution": {
        "label": "QA 与冲突处理",
        "keywords": ["qa", "质检", "冲突", "conflict", "revision", "返工", "stop condition"],
        "default_radius": "outside_radius",
        "outside_why": "多 Agent 输出必须有质检、冲突合并和停止条件",
    },
    "memory_writeback": {
        "label": "协作记忆写回",
        "keywords": ["memory", "记忆", "writeback", "workflow asset", "复用", "沉淀"],
        "default_radius": "automation_sensitive",
        "automation_why": "长期记忆会影响后续路由和授权，必须先展示写回预览",
    },
    "feedback_triage": {
        "label": "反馈分诊",
        "keywords": ["反馈", "评论", "私信", "用户反馈", "feedback", "小红书", "product hunt", "即刻"],
        "default_radius": "outside_radius",
        "outside_why": "跨平台反馈需要去重、聚类和信号强度判断，不能只凭单条评论下结论",
    },
    "research_synthesis": {
        "label": "研究归纳",
        "keywords": ["研究", "协作产品", "linear", "slack", "飞书", "paperclip", "symphony", "竞品", "产品研究"],
        "default_radius": "outside_radius",
        "outside_why": "跨产品研究需要把事实、推断、证据强弱和待确认信息结构化",
    },
    "product_critique": {
        "label": "产品批判",
        "keywords": ["优点", "局限", "反例", "风险", "批判", "局限性", "tradeoff", "critic"],
        "default_radius": "outside_radius",
        "outside_why": "需要主动寻找反例、局限和不可迁移条件，避免只输出正向总结",
    },
    "collaboration_design": {
        "label": "协作设计",
        "keywords": ["协作", "agent 介入", "工作流", "guardrails", "human-in-the-loop", "交互协议", "协作协议"],
        "default_radius": "outside_radius",
        "outside_why": "需要把研究结论转成可执行的 Agent 介入点、授权边界和人审节点",
    },
    "product_iteration": {
        "label": "产品迭代收敛",
        "keywords": ["迭代", "产品方向", "优先级", "roadmap", "iteration"],
        "default_radius": "outside_radius",
        "outside_why": "需要把用户信号、目标用户和产品策略合并成下一轮迭代判断",
    },
    "trust_activation": {
        "label": "信任与激活",
        "keywords": ["宣传文案", "文案", "转化", "激活", "信任", "gtm", "launch", "发布"],
        "default_radius": "outside_radius",
        "outside_why": "平台文案和激活路径涉及承诺边界、信任门槛与用户行动设计",
    },
    "execution_handoff": {
        "label": "执行交接",
        "keywords": ["发布", "上传", "小红书", "Product Hunt", "即刻", "handoff"],
        "default_radius": "automation_sensitive",
        "automation_why": "发布、私信和跨平台外部动作必须先生成草稿并等待审批",
    },
    "evaluation_design": {
        "label": "评测设计",
        "keywords": ["指标", "评测", "转化", "留资", "数据", "分析", "metrics", "evaluation"],
        "default_radius": "outside_radius",
        "outside_why": "需要定义反馈是否足够支撑产品迭代的证据标准和停止条件",
    },
    "job_scoring": {
        "label": "岗位打分",
        "keywords": ["岗位", "jd", "职位", "打分", "匹配", "job"],
        "default_radius": "outside_radius",
        "outside_why": "岗位排序需要证据映射和约束判断",
    },
    "resume_evidence": {
        "label": "简历证据映射",
        "keywords": ["简历", "resume", "证据", "经历"],
        "default_radius": "inside_radius",
        "inside_why": "用户能判断自身经历真实性，适合深挖和确认",
    },
    "application_risk_policy": {
        "label": "申请风险策略",
        "keywords": ["投递", "auto apply", "自动投递", "联系招聘方", "编造"],
        "default_radius": "automation_sensitive",
        "automation_why": "外部联系、自动投递和简历改写必须 human-in-the-loop",
    },
}

EVAL_DIMENSIONS = [
    "Goal clarity",
    "能力半径识别准确度",
    "专家选择必要性",
    "是否避免过度协作",
    "用户判断负担",
    "过程噪音",
    "结果可判断性",
    "授权边界清晰度",
    "handoff 可执行性",
    "workflow asset 可复用性",
    "第二次任务复用效果",
    "token/latency/noise 成本",
]


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def save_json(filename: str, payload: Any) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / filename).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_markdown(filename: str, content: str) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / filename).write_text(content, encoding="utf-8")


def _safe_list(value: Any) -> List[str]:
    if isinstance(value, list):
        return [str(x) for x in value]
    if value is None:
        return []
    return [str(value)]


def _contains_any(text: str, keywords: List[str]) -> bool:
    return any(k in text for k in keywords)


def _looks_like_autojob_skill_heavy(text: str) -> bool:
    lower_text = (text or "").lower()
    has_autojob_signal = _contains_any(
        lower_text,
        ["auto-jobhunter", "jobhunter", "auto job", "job hunter", "job opportunity", "resume", "jd"],
    ) or _contains_any(text, ["岗位", "职位", "简历", "投递", "招聘方", "求职"])
    if not has_autojob_signal:
        return False

    asks_new_agent_team = (
        _contains_any(lower_text, ["agent team", "agent team builder", "multi-agent workflow", "artifact contract"])
        or _contains_any(text, ["设计最小 Agent team", "构建多 Agent", "创建任务房间", "角色分工"])
    )
    skill_heavy_scope = _contains_any(
        lower_text,
        ["top jobs"],
    ) or _contains_any(text, ["官网", "搜集", "筛选", "打分", "不要修改简历", "不要自动投递", "当前只需要"])

    return skill_heavy_scope and not asks_new_agent_team


def _looks_like_product_research_task(text: str) -> bool:
    lower_text = (text or "").lower()
    return _contains_any(
        lower_text,
        [
            "linear",
            "slack",
            "paperclip",
            "symphony",
            "collaboration product",
            "agent collaboration",
            "human-in-the-loop",
            "guardrails",
            "complex product research",
        ],
    ) or _contains_any(
        text,
        [
            "协作产品",
            "产品研究",
            "复杂产品研究",
            "飞书",
            "Agent 协作",
            "Agent 介入",
            "交互协议",
            "协作协议",
            "产品对比",
            "面试观点",
        ],
    )


def _keyword_with_prefix(text: str, prefixes: List[str], keywords: List[str]) -> bool:
    for prefix in prefixes:
        for keyword in keywords:
            if f"{prefix}{keyword}" in text:
                return True
    return False


def _capability_label(capability: str) -> str:
    return CAPABILITY_CATALOG.get(capability, {}).get("label", capability)


def _radius_reason(capability: str, radius_type: str) -> str:
    cfg = CAPABILITY_CATALOG.get(capability, {})
    if radius_type == "inside_radius":
        return cfg.get("inside_why", "用户可直接判断细节与取舍")
    if radius_type == "automation_sensitive":
        return cfg.get("automation_why", "涉及自动化边界，需要审批与回滚")
    return cfg.get("outside_why", "用户更偏好结果优先与证据优先")


def _recommendation_for_radius(radius_type: str) -> Tuple[str, str]:
    if radius_type == "inside_radius":
        return "high", "discuss_details"
    if radius_type == "automation_sensitive":
        return "low", "delegate_with_review"
    return "low", "result_first"


def build_capability_radius(
    user_input: str,
    capability_boundary: str,
    required_capabilities: List[str] | None = None,
) -> Dict[str, Any]:
    text = f"{user_input}\n{capability_boundary}".lower()
    required_set = set(required_capabilities or [])

    radius_map: Dict[str, str] = {}
    for capability, cfg in CAPABILITY_CATALOG.items():
        radius_map[capability] = cfg["default_radius"]

    for capability, cfg in CAPABILITY_CATALOG.items():
        keywords = [x.lower() for x in cfg.get("keywords", [])]
        if not any(k in text for k in keywords):
            continue
        if _keyword_with_prefix(text, ["不擅长", "不熟", "不熟悉", "不强", "薄弱", "欠缺"], keywords):
            radius_map[capability] = "outside_radius"
        elif _keyword_with_prefix(text, ["擅长", "熟悉", "强", "精通", "经验"], keywords):
            radius_map[capability] = "inside_radius"

    for capability in required_set:
        if capability not in radius_map:
            continue
        if radius_map[capability] == "inside_radius":
            continue
        if capability == "execution_handoff":
            radius_map[capability] = "automation_sensitive"
        elif capability == "automation_risk_governance":
            radius_map[capability] = "automation_sensitive"
        else:
            radius_map[capability] = "outside_radius"

    inside: List[Dict[str, Any]] = []
    outside: List[Dict[str, Any]] = []
    automation: List[Dict[str, Any]] = []

    for capability, radius_type in radius_map.items():
        confidence, preferred_mode = _recommendation_for_radius(radius_type)
        if radius_type == "inside_radius":
            inside.append(
                {
                    "capability": capability,
                    "label": _capability_label(capability),
                    "confidence": confidence,
                    "preferred_mode": preferred_mode,
                    "why": _radius_reason(capability, radius_type),
                }
            )
        elif radius_type == "automation_sensitive":
            automation.append(
                {
                    "capability": capability,
                    "label": _capability_label(capability),
                    "preferred_mode": preferred_mode,
                    "required_controls": ["blocked_actions", "rollback_condition", "review_required"],
                    "why": _radius_reason(capability, radius_type),
                }
            )
        else:
            outside.append(
                {
                    "capability": capability,
                    "label": _capability_label(capability),
                    "confidence": confidence,
                    "preferred_mode": preferred_mode,
                    "why": _radius_reason(capability, radius_type),
                }
            )

    return {
        "inside_radius": inside,
        "outside_radius": outside,
        "automation_sensitive": automation,
    }


def assign_collaboration_modes(goal_check: Dict[str, Any], capability_radius: Dict[str, Any]) -> Dict[str, Any]:
    by_capability: Dict[str, Dict[str, str]] = {}

    for item in capability_radius.get("inside_radius", []):
        cap = item.get("capability")
        if not cap:
            continue
        by_capability[cap] = {
            "mode": "co_think",
            "detail_level": "high",
            "user_action": "review_and_challenge",
        }

    for item in capability_radius.get("outside_radius", []):
        cap = item.get("capability")
        if not cap:
            continue
        by_capability[cap] = {
            "mode": "result_first",
            "detail_level": "summary_with_evidence",
            "user_action": "accept_or_ask_for_evidence",
        }

    for item in capability_radius.get("automation_sensitive", []):
        cap = item.get("capability")
        if not cap:
            continue
        by_capability[cap] = {
            "mode": "delegate_with_review",
            "detail_level": "boundary_first",
            "user_action": "approve_or_block",
        }

    for cap in goal_check.get("required_capabilities", []):
        if cap in by_capability:
            continue
        by_capability[cap] = {
            "mode": "result_first",
            "detail_level": "summary_with_evidence",
            "user_action": "accept_or_ask_for_evidence",
        }

    return {"by_capability": by_capability}


def build_runtime_decision(goal_check: Dict[str, Any], capability_radius: Dict[str, Any]) -> Dict[str, Any]:
    recommendation = goal_check.get("recommendation", "clarify")
    required = _safe_list(goal_check.get("required_capabilities"))
    outside_count = len(capability_radius.get("outside_radius", []))
    automation_count = len(capability_radius.get("automation_sensitive", []))

    if not goal_check.get("executable_goal"):
        runtime = "clarify"
    elif recommendation == "task_room":
        runtime = "dynamic_task_room"
    elif any(cap in required for cap in ["job_scoring", "resume_evidence", "application_risk_policy"]):
        runtime = "skill_heavy_with_human_checkpoints"
    else:
        runtime = "single_agent"

    if recommendation == "task_room":
        task_complexity = "high"
    elif len(required) >= 3 or outside_count >= 3:
        task_complexity = "medium"
    else:
        task_complexity = "low"

    automation_risk = goal_check.get("automation_risk", "low")
    risk_boundary = "high" if automation_risk in {"medium-high", "high"} else automation_risk

    input_type = goal_check.get("input_type", "goal")
    if runtime == "skill_heavy_with_human_checkpoints":
        intent_mode = "delegate_stable_workflow"
    elif input_type == "execution_request":
        intent_mode = "execute_with_approval"
    elif recommendation == "task_room":
        intent_mode = "design_collaboration"
    elif input_type == "decision":
        intent_mode = "decide"
    else:
        intent_mode = "answer_or_lightweight_plan"

    if runtime == "dynamic_task_room":
        why_not_skill = (
            "当前任务跨多个能力缺口，且需要动态定义 agent team、artifact contract、QA / merge rule 和 stop condition。"
        )
        why_not_task_room = ""
    elif runtime == "skill_heavy_with_human_checkpoints":
        why_not_skill = ""
        why_not_task_room = "主要工作可由已注册 skill pipeline 覆盖；风险集中在审批、外部动作和记忆写回，不需要开放 Task Room。"
    elif runtime == "single_agent":
        why_not_skill = "当前目标尚未命中稳定 skill pipeline，轻量 single agent 足够先推进。"
        why_not_task_room = "任务不需要动态拆分角色、合并多方 artifact 或处理跨 agent 冲突。"
    else:
        why_not_skill = "目标尚未清晰到可选择 skill。"
        why_not_task_room = "目标尚未清晰到可创建 Task Room。"

    return {
        "runtime": runtime,
        "decision_factors": {
            "task_complexity": task_complexity,
            "user_capability_radius": {
                "inside_count": len(capability_radius.get("inside_radius", [])),
                "outside_count": outside_count,
                "automation_sensitive_count": automation_count,
            },
            "intent_mode": intent_mode,
            "risk_boundary": risk_boundary,
        },
        "collaboration_policy": {
            "inside_radius": "co-think with detail",
            "outside_radius": "result-first with evidence",
            "automation_sensitive": "approval-required with blocked actions",
        },
        "why_not_skill": why_not_skill,
        "why_not_task_room": why_not_task_room,
    }


def _radius_type_for_capability(capability: str, capability_radius: Dict[str, Any]) -> str:
    for key in ["inside_radius", "outside_radius", "automation_sensitive"]:
        for item in capability_radius.get(key, []):
            if item.get("capability") == capability:
                return key
    return "outside_radius"


def _manifest_maps() -> Tuple[Dict[str, Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    manifest = load_json(DATA_DIR / "agent_manifest.json")
    by_capability: Dict[str, Dict[str, Any]] = {}
    by_agent: Dict[str, Dict[str, Any]] = {}
    for item in manifest:
        cap = str(item.get("capability", "")).strip()
        agent = str(item.get("agent", "")).strip()
        if cap:
            by_capability[cap] = item
        if agent:
            by_agent[agent] = item
    return by_capability, by_agent


def select_experts_by_radius(
    goal_check: Dict[str, Any],
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    by_capability, _ = _manifest_maps()

    required = goal_check.get("required_capabilities") or DEFAULT_REQUIRED_CAPABILITIES
    selected: List[Dict[str, Any]] = []

    for capability in required:
        manifest_item = by_capability.get(capability)
        agent_name = manifest_item.get("agent") if manifest_item else f"{_capability_label(capability)} Agent"
        radius_type = _radius_type_for_capability(capability, capability_radius)
        mode = collaboration_mode.get("by_capability", {}).get(capability, {}).get("mode", "result_first")

        if radius_type == "inside_radius":
            covers_gap = "inside_radius"
            output_policy = "co-design and show tradeoffs"
        elif radius_type == "automation_sensitive":
            covers_gap = "automation_sensitive"
            output_policy = "boundary-first with approval and rollback"
        else:
            covers_gap = "outside_radius"
            output_policy = "conclusion-first with evidence"

        selected.append(
            {
                "agent": agent_name,
                "capability": capability,
                "covers_gap": covers_gap,
                "radius_type": radius_type,
                "collaboration_mode": mode,
                "why_selected": _radius_reason(capability, radius_type),
                "output_policy": output_policy,
            }
        )

    excluded = deepcopy(goal_check.get("excluded_agents") or DEFAULT_EXCLUDED_AGENTS)
    return selected, excluded


def _normalize_team(value: Any, fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return fallback
    cleaned: List[Dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            agent = str(item.get("agent", "")).strip()
            if not agent:
                continue
            entry: Dict[str, Any] = {
                "agent": agent,
                "why_selected": str(item.get("why_selected", "覆盖必要能力缺口并影响授权决策")).strip(),
            }
            for key in ["capability", "covers_gap", "radius_type", "collaboration_mode", "output_policy"]:
                if key in item and item[key] is not None:
                    entry[key] = str(item[key])
            cleaned.append(entry)
        elif isinstance(item, str):
            cleaned.append(
                {
                    "agent": item,
                    "why_selected": "覆盖必要能力缺口并影响授权决策",
                }
            )
    return cleaned or fallback


def _normalize_excluded(value: Any, fallback: List[Dict[str, str]]) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return fallback
    cleaned: List[Dict[str, str]] = []
    for item in value:
        if isinstance(item, dict):
            agent = str(item.get("agent", "")).strip()
            if not agent:
                continue
            why = str(item.get("why_excluded", "当前阶段非必要能力")).strip()
            cleaned.append({"agent": agent, "why_excluded": why})
        elif isinstance(item, str):
            cleaned.append({"agent": item, "why_excluded": "当前阶段非必要能力"})
    return cleaned or fallback


def _normalize_auth_scope(value: Any, fallback: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return deepcopy(fallback)
    return {
        "allowed": _safe_list(value.get("allowed") or fallback.get("allowed")),
        "needs_approval": _safe_list(value.get("needs_approval") or fallback.get("needs_approval")),
        "blocked": _safe_list(value.get("blocked") or fallback.get("blocked")),
        "review_required": bool(value.get("review_required", fallback.get("review_required", True))),
    }


def _enrich_selected_agents(
    selected_agents: List[Dict[str, Any]],
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> List[Dict[str, Any]]:
    by_capability, by_agent = _manifest_maps()
    enriched: List[Dict[str, Any]] = []

    for item in selected_agents:
        agent = item.get("agent", "")
        capability = item.get("capability")
        if not capability:
            manifest_item = by_agent.get(agent, {})
            capability = manifest_item.get("capability", "")
        capability = str(capability or "").strip()
        if not capability:
            capability = "collaboration_design"

        radius_type = item.get("radius_type") or _radius_type_for_capability(capability, capability_radius)
        mode = item.get("collaboration_mode") or collaboration_mode.get("by_capability", {}).get(capability, {}).get("mode", "result_first")
        covers_gap = item.get("covers_gap") or radius_type

        merged = dict(item)
        merged["capability"] = capability
        merged["covers_gap"] = covers_gap
        merged["radius_type"] = radius_type
        merged["collaboration_mode"] = mode
        merged["output_policy"] = item.get("output_policy") or (
            "co-design and show tradeoffs"
            if radius_type == "inside_radius"
            else "boundary-first with approval and rollback"
            if radius_type == "automation_sensitive"
            else "conclusion-first with evidence"
        )
        enriched.append(merged)

    if not enriched:
        fallback, _ = select_experts_by_radius({"required_capabilities": DEFAULT_REQUIRED_CAPABILITIES}, capability_radius, collaboration_mode)
        return fallback
    return enriched


def _validate_expert_output(payload: Dict[str, Any], packet: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "agent": payload.get("agent") or packet.get("agent", "Unknown Agent"),
        "capability": payload.get("capability") or packet.get("capability", ""),
        "covers_gap": payload.get("covers_gap") or packet.get("covers_gap", "outside_radius"),
        "collaboration_mode": payload.get("collaboration_mode") or packet.get("collaboration_mode", "result_first"),
        "judgment": str(payload.get("judgment", "")),
        "key_findings": _safe_list(payload.get("key_findings")),
        "evidence": _safe_list(payload.get("evidence")),
        "risks": _safe_list(payload.get("risks")),
        "missing_information": _safe_list(payload.get("missing_information")),
        "next_validation_step": str(payload.get("next_validation_step", "")),
        "authorization_impact": str(payload.get("authorization_impact", "未明确")),
        "confidence": str(payload.get("confidence", "medium")),
        "should_be_saved_to_workflow": bool(payload.get("should_be_saved_to_workflow", True)),
    }


def _heuristic_goal_check(user_input: str, capability_boundary: str) -> Dict[str, Any]:
    text = (user_input or "").strip()
    lower_text = text.lower()

    has_goal_signal = _contains_any(
        text,
        ["请", "帮我", "我想", "需要", "当前只需要", "判断", "生成", "设计", "迭代", "执行", "验证", "是否", "输出", "搜集", "筛选", "打分", "完成"],
    )
    has_agent_builder_signal = _contains_any(
        lower_text,
        ["multi-agent", "agent team", "builder", "role assignment", "conflict", "artifact", "schema", "qa", "需要什么 agent"],
    ) or _contains_any(text, ["多 Agent", "多个 Agent", "构建什么 Agent", "需要哪些 Agent", "角色分工", "冲突处理", "质检"])
    has_autojob_signal = _contains_any(
        lower_text,
        ["auto-jobhunter", "jobhunter", "auto job", "job hunter", "job opportunity", "resume", "jd"],
    ) or _contains_any(text, ["岗位", "职位", "简历", "投递", "招聘方", "求职"])
    asks_new_agent_team_for_job = has_autojob_signal and (
        _contains_any(lower_text, ["agent team", "agent team builder", "multi-agent workflow", "artifact contract"])
        or _contains_any(text, ["设计最小 Agent team", "构建多 Agent", "创建任务房间", "角色分工"])
    )
    explicit_job_skill_only = _looks_like_autojob_skill_heavy(text)
    has_product_research_signal = _looks_like_product_research_task(text)
    has_execution_signal = _contains_any(text, ["自动执行", "外部动作", "授权", "长期记忆", "写回", "投递", "联系招聘方"])
    has_simple_signal = _contains_any(text, ["润色", "改写", "翻译", "总结", "提纲", "校对", "格式化", "写一段"])

    if has_goal_signal:
        blocked_execution_mentions = _contains_any(text, ["不要自动投递", "不能自动投递", "禁止自动投递", "不要联系招聘方", "不能联系招聘方"])
        if _contains_any(text, ["执行", "patch", "部署", "投递", "联系招聘方"]) and not blocked_execution_mentions:
            input_type = "execution_request"
        elif _contains_any(text, ["决策", "是否"]):
            input_type = "decision"
        else:
            input_type = "goal"
        executable_goal = True
    elif len(text) < 10:
        input_type = "note"
        executable_goal = False
    elif ("?" in text or "吗" in text) and not has_goal_signal:
        input_type = "question"
        executable_goal = False
    else:
        input_type = "idea"
        executable_goal = False

    needs_task_room = (
        executable_goal
        and not explicit_job_skill_only
        and (
            (has_agent_builder_signal and (not has_autojob_signal or asks_new_agent_team_for_job))
            or has_product_research_signal
        )
        and (has_product_research_signal or not has_simple_signal)
    )
    single_agent_sufficient = executable_goal and not needs_task_room

    required_capabilities: List[str] = []
    minimum_completion_path: List[str] = []
    success_criteria: List[str] = []
    minimum_viable_team: List[Dict[str, Any]] = []
    excluded_agents: List[Dict[str, str]] = []
    suggested_experts: List[str] = []
    capability_blindspots: List[str] = []

    current_autonomy_level = "Level 1: Draft with approval"
    recommended_autonomy_level = "Level 1: Draft with approval"
    automation_risk = "low"

    authorization_scope = {
        "allowed": ["输出分析结论", "生成轻量草稿"],
        "needs_approval": ["关键流程改动"],
        "blocked": ["自动上线", "自动触达用户"],
        "review_required": True,
    }

    if needs_task_room and has_product_research_signal and not asks_new_agent_team_for_job:
        recommended_autonomy_level = "Level 2: Build agent team spec after approval"
        automation_risk = "medium"
        authorization_scope = {
            "allowed": ["生成产品研究卡", "生成协作机制对比表", "生成 Agent 介入点和 guardrails", "生成 playbook 写回预览"],
            "needs_approval": ["把研究结论用于投递材料", "保存产品研究 playbook", "让候选 Evaluation Agent 进入后续评测"],
            "blocked": ["伪造外部事实", "把待确认资料写成确定事实", "自动注册新 Agent", "写入未经确认的长期记忆"],
            "review_required": True,
        }
        required_capabilities = deepcopy(PRODUCT_RESEARCH_REQUIRED_CAPABILITIES)
        minimum_completion_path = deepcopy(PRODUCT_RESEARCH_MINIMUM_COMPLETION_PATH)
        success_criteria = deepcopy(PRODUCT_RESEARCH_SUCCESS_CRITERIA)
        minimum_viable_team = deepcopy(PRODUCT_RESEARCH_MINIMUM_TEAM)
        excluded_agents = [
            {"agent": "Open-Ended Swarm Agent", "why_excluded": "开放式群聊无法保证研究证据、批判结论和设计方案按 contract 合并。"},
            {"agent": "Full Automation Agent", "why_excluded": "研究结论、playbook 写回和 candidate agent 注册都必须人工审批。"},
            {"agent": "Growth Agent", "why_excluded": "当前示例不是发布增长任务，增长策略不进入本次最小路径。"},
        ]
        suggested_experts = [x["agent"] for x in minimum_viable_team]
        capability_blindspots = ["跨产品研究归纳", "产品批判与反例", "协作协议设计", "评测指标", "外部事实确认"]
    elif needs_task_room:
        recommended_autonomy_level = "Level 2: Build agent team spec after approval"
        automation_risk = "medium-high" if has_execution_signal else "medium"
        authorization_scope = deepcopy(DEFAULT_AUTHORIZATION_SCOPE)
        required_capabilities = deepcopy(DEFAULT_REQUIRED_CAPABILITIES)
        minimum_completion_path = deepcopy(DEFAULT_MINIMUM_COMPLETION_PATH)
        success_criteria = deepcopy(DEFAULT_SUCCESS_CRITERIA)
        minimum_viable_team = deepcopy(DEFAULT_MINIMUM_VIABLE_TEAM)
        excluded_agents = deepcopy(DEFAULT_EXCLUDED_AGENTS)
        suggested_experts = [x["agent"] for x in minimum_viable_team]
        capability_blindspots = ["任务拆解", "角色分配", "产物合约", "QA 与冲突处理", "协作记忆写回"]
    elif has_autojob_signal and executable_goal:
        automation_risk = "medium-high" if has_execution_signal else "medium"
        authorization_scope = {
            "allowed": ["通过 boss-agent-cli 只读获取岗位/JD", "标准化岗位字段", "岗位筛选与打分", "输出 Top jobs checkpoint"],
            "needs_approval": ["登录 BOSS", "读取已登录账号可见岗位结果", "根据目标 JD 修改简历", "保存求职 workflow memory"],
            "blocked": ["自动投递", "联系招聘方", "批量打招呼", "绕过验证码", "编造简历经历", "保存原始简历全文"],
            "review_required": True,
        }
        required_capabilities = ["job_scoring", "application_risk_policy", "memory_writeback"]
        minimum_completion_path = [
            "调用 boss_job_fit_skill，通过 Chrome CDP + boss-agent-cli 只读获取岗位列表和完整 JD",
            "在 skill 内完成岗位标准化、fit score、风险打分和简历证据映射",
            "输出 Top jobs checkpoint，等待用户确认是否进入简历修改阶段",
            "由 harness services 展示禁止自动投递、联系招聘方、编造经历和 memory writeback preview",
        ]
        success_criteria = [
            "用户能判断哪些岗位值得优先看",
            "每个推荐都有岗位字段、打分理由和风险说明",
            "系统明确把修改简历与投递放到后续人工确认阶段",
            "系统明确阻止自动投递、外部联系和经历编造",
            "求职 workflow 只在确认后写回",
        ]
        minimum_viable_team = [
            {
                "agent": "Application Risk Policy Agent",
                "capability": "application_risk_policy",
                "why_selected": "阻止自动投递、联系招聘方和把简历修改提前到未确认阶段。",
            },
            {"agent": "Memory Writeback Agent", "capability": "memory_writeback", "why_selected": "输出可确认的求职 workflow 写回预览。"},
        ]
        excluded_agents = [
            {"agent": "Job Scoring Agent", "why_excluded": "岗位获取、JD 标准化、打分和证据映射已经沉淀为 boss_job_fit_skill，不需要单独创建专家。"},
            {"agent": "Resume Evidence Agent", "why_excluded": "证据映射由 boss_job_fit_skill 输出；根据 JD 修改简历属于后续需确认阶段。"},
            {"agent": "Auto Apply Agent", "why_excluded": "真实投递和外部联系必须由用户确认。"},
            {"agent": "Open-Ended Swarm Agent", "why_excluded": "岗位打分主要由 skill pipeline 覆盖，不需要开放式群聊。"},
        ]
        suggested_experts = [x["agent"] for x in minimum_viable_team]
        capability_blindspots = ["岗位排序偏差", "简历证据不足", "自动投递风险", "memory 污染"]

    if not executable_goal:
        recommendation = "clarify"
        why = "当前输入更像想法或问题，还未形成可执行目标。"
    elif has_autojob_signal and single_agent_sufficient:
        recommendation = "single_agent"
        why = "这是 Auto-JobHunter 的 human-agent collaboration 示例：Header Agent 判断岗位获取、JD 标准化、打分和证据映射已沉淀为 boss_job_fit_skill；Harness 只负责 checkpoint、授权边界和 memory preview，不需要创建 Task Room。"
    elif single_agent_sufficient:
        recommendation = "single_agent"
        why = "目标聚焦且风险较低，single agent 或 skill-heavy 路径可先完成，暂不需要 Task Room。"
    else:
        recommendation = "task_room"
        why = (
            "这是复杂产品研究 Room 示例：跨产品研究、批判、协作设计和评估指标不适合由单个 Skill 或一篇长答案覆盖；"
            "需要 Room Controller 组织已注册 Agent 产出可合并 artifact，并把 candidate Agent、人审和写回边界显性化。"
        )

    return {
        "input_type": input_type,
        "interpreted_goal": text if text else "（空输入）",
        "executable_goal": executable_goal,
        "needs_task_room": needs_task_room,
        "single_agent_sufficient": single_agent_sufficient,
        "recommendation": recommendation,
        "why": why,
        "why_single_agent_not_enough": (
            "需要显式输出最小 Agent team、artifact contract、QA / conflict resolution、stop condition 和 memory writeback preview。"
            if needs_task_room
            else ""
        ),
        "current_autonomy_level": current_autonomy_level,
        "recommended_autonomy_level": recommended_autonomy_level,
        "automation_risk": automation_risk,
        "authorization_scope": authorization_scope,
        "success_criteria": success_criteria if executable_goal else [],
        "minimum_completion_path": minimum_completion_path,
        "required_capabilities": required_capabilities,
        "minimum_viable_team": minimum_viable_team,
        "excluded_agents": excluded_agents,
        "suggested_experts": suggested_experts,
        "clarification_questions": [
            "你想达成的可验证结果是什么？",
            "时间/资源约束是什么？",
            "你希望 AI 推进到哪一步（分析、草稿、执行）？",
        ]
        if not executable_goal
        else [],
        "capability_blindspots": capability_blindspots,
        "capability_boundary": capability_boundary,
    }


def _goal_check_live(user_input: str, capability_boundary: str, model: str, provider: str) -> Dict[str, Any]:
    prompt = read_text(PROMPTS_DIR / "goal_check.md")
    manifest = load_json(DATA_DIR / "agent_manifest.json")
    client = LLMClient(model=model, provider=provider)
    fallback = _heuristic_goal_check(user_input, capability_boundary)

    user_prompt = (
        f"用户输入：\n{user_input}\n\n"
        f"用户能力边界：\n{capability_boundary}\n\n"
        f"可选专家 manifest：\n{json.dumps(manifest, ensure_ascii=False, indent=2)}"
    )
    raw = client.chat_json(prompt, user_prompt)

    parsed = {
        "input_type": str(raw.get("input_type", fallback["input_type"])),
        "interpreted_goal": str(raw.get("interpreted_goal", fallback["interpreted_goal"])),
        "executable_goal": bool(raw.get("executable_goal", fallback["executable_goal"])),
        "needs_task_room": bool(raw.get("needs_task_room", fallback["needs_task_room"])),
        "single_agent_sufficient": bool(raw.get("single_agent_sufficient", fallback["single_agent_sufficient"])),
        "recommendation": str(raw.get("recommendation", fallback["recommendation"])),
        "why": str(raw.get("why", fallback["why"])),
        "why_single_agent_not_enough": str(raw.get("why_single_agent_not_enough", fallback["why_single_agent_not_enough"])),
        "current_autonomy_level": str(raw.get("current_autonomy_level", fallback["current_autonomy_level"])),
        "recommended_autonomy_level": str(raw.get("recommended_autonomy_level", fallback["recommended_autonomy_level"])),
        "automation_risk": str(raw.get("automation_risk", fallback["automation_risk"])),
        "authorization_scope": _normalize_auth_scope(raw.get("authorization_scope"), fallback["authorization_scope"]),
        "success_criteria": _safe_list(raw.get("success_criteria") or fallback["success_criteria"]),
        "minimum_completion_path": _safe_list(raw.get("minimum_completion_path") or fallback["minimum_completion_path"]),
        "required_capabilities": _safe_list(raw.get("required_capabilities") or fallback["required_capabilities"]),
        "minimum_viable_team": _normalize_team(raw.get("minimum_viable_team"), fallback["minimum_viable_team"]),
        "excluded_agents": _normalize_excluded(raw.get("excluded_agents"), fallback["excluded_agents"]),
        "suggested_experts": _safe_list(raw.get("suggested_experts") or fallback["suggested_experts"]),
        "clarification_questions": _safe_list(raw.get("clarification_questions") or fallback["clarification_questions"]),
        "capability_blindspots": _safe_list(raw.get("capability_blindspots") or fallback["capability_blindspots"]),
        "capability_boundary": capability_boundary,
    }

    if parsed["recommendation"] not in {"clarify", "single_agent", "task_room"}:
        parsed["recommendation"] = fallback["recommendation"]

    if _looks_like_autojob_skill_heavy(user_input):
        parsed = deepcopy(fallback)
    elif _looks_like_product_research_task(user_input) and parsed["recommendation"] != "task_room":
        parsed = deepcopy(fallback)

    if parsed["recommendation"] != "task_room" and not _looks_like_autojob_skill_heavy(user_input):
        parsed["minimum_completion_path"] = []
        parsed["required_capabilities"] = []
        parsed["minimum_viable_team"] = []
        parsed["excluded_agents"] = []

    return parsed


def _build_context_packets(
    goal_check: Dict[str, Any],
    capability_boundary: str,
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> List[Dict[str, Any]]:
    packets = []
    for agent_item in goal_check.get("minimum_viable_team", []):
        agent = agent_item.get("agent", "Unknown Agent")
        capability = agent_item.get("capability", "")
        radius_type = agent_item.get("covers_gap") or _radius_type_for_capability(capability, capability_radius)
        mode = agent_item.get("collaboration_mode") or collaboration_mode.get("by_capability", {}).get(capability, {}).get("mode", "result_first")

        packets.append(
            {
                "agent": agent,
                "capability": capability,
                "covers_gap": radius_type,
                "collaboration_mode": mode,
                "task": f"围绕 minimum completion path 完成 {agent} 的子任务",
                "minimum_completion_path": goal_check.get("minimum_completion_path", []),
                "necessary_context": [
                    f"用户目标：{goal_check.get('interpreted_goal', '')}",
                    f"当前自治等级：{goal_check.get('current_autonomy_level', '')}",
                    f"能力边界：{capability_boundary}",
                    "仅输出统一 schema",
                ],
                "excluded_context": [
                    "无关历史聊天",
                    "未确认外部事实",
                    "和当前子任务无关的长讨论",
                ],
                "expected_output": {
                    "agent": agent,
                    "capability": capability,
                    "covers_gap": radius_type,
                    "collaboration_mode": mode,
                    "judgment": "",
                    "key_findings": [],
                    "evidence": [],
                    "risks": [],
                    "missing_information": [],
                    "next_validation_step": "",
                    "authorization_impact": "",
                    "confidence": "low | medium | high",
                    "should_be_saved_to_workflow": True,
                },
                "success_criteria": "输出能改变最终决策或降低自动化风险",
            }
        )
    return packets


def _candidate_capability(agent_name: str) -> str:
    mapping = {
        "Trust & Activation Agent": "trust_activation",
        "Evaluation Agent": "evaluation_design",
        "Community Signal Agent": "community_signal",
    }
    return mapping.get(agent_name, "")


def _candidate_agent_spec(agent_name: str, capability: str, why_needed: str) -> Dict[str, Any]:
    return {
        "agent": agent_name,
        "capability": capability,
        "status": "candidate_only",
        "generated_by": "external_agent_builder_tool_protocol",
        "why_needed": why_needed,
        "input_contract": ["task_goal", "scoped_memory", "registered_agent_artifacts", "blocked_actions"],
        "output_contract": ["structured_artifact", "evidence", "risk_notes", "stop_condition"],
        "blocked_actions": ["enter_trusted_execution_without_eval", "perform_external_actions", "write_long_term_memory_without_approval"],
        "eval_required": True,
    }


def _build_capability_gap_report(
    goal_check: Dict[str, Any],
    registered_agents: List[Dict[str, Any]] | None = None,
    covered_by_skills: List[Dict[str, Any]] | None = None,
    missing_capabilities: List[str] | None = None,
    candidate_agent_specs: List[Dict[str, Any]] | None = None,
    gap_severity: str | None = None,
    minimal_path: List[str] | None = None,
    human_checkpoint: str = "",
) -> Dict[str, Any]:
    registered_agents = registered_agents or []
    covered_by_skills = covered_by_skills or []
    candidate_agent_specs = candidate_agent_specs or []

    required = _safe_list(goal_check.get("required_capabilities"))
    covered_registered = [
        {
            "capability": item.get("capability", ""),
            "agent": item.get("agent", ""),
            "source": item.get("source", "agent_manifest.json"),
            "status": item.get("status", "registered"),
        }
        for item in registered_agents
        if item.get("capability")
    ]

    covered_caps = {item.get("capability") for item in covered_registered if item.get("capability")}
    covered_caps.update(item.get("capability") for item in covered_by_skills if item.get("capability"))
    inferred_missing = [cap for cap in required if cap and cap not in covered_caps]
    missing = list(dict.fromkeys(_safe_list(missing_capabilities) if missing_capabilities is not None else inferred_missing))

    if gap_severity is None:
        if not missing:
            severity = "none"
        elif candidate_agent_specs:
            severity = "recoverable"
        else:
            severity = "blocking"
    else:
        severity = gap_severity

    agent_builder_call = None
    if missing or candidate_agent_specs:
        agent_builder_call = {
            "tool": "external_agent_builder",
            "status": "proposed_not_executed",
            "why": "Room Controller 只提出 candidate agent spec；通过 Agent Eval 前不进入可信执行。",
            "inputs": ["missing_capabilities", "task_goal", "artifact_contract", "blocked_actions"],
            "outputs": ["candidate_agent_spec", "eval_plan", "registration_recommendation"],
        }

    eval_gate = []
    if candidate_agent_specs:
        eval_gate = [
            "必须在 3 个以上同类任务中输出结构化 artifact",
            "必须遵守 blocked actions，不能自动执行外部动作",
            "必须证明相比现有 registered agents 能降低噪音或提高结果质量",
            "通过后只注册为 registered agent；多次稳定复用后才可能升级为 skill",
        ]

    return {
        "required_capabilities": required,
        "covered_by_registered_agents": covered_registered,
        "covered_by_skills": covered_by_skills,
        "missing_capabilities": missing,
        "gap_severity": severity,
        "minimal_path": minimal_path or _safe_list(goal_check.get("minimum_completion_path")),
        "candidate_agent_specs": candidate_agent_specs,
        "agent_builder_call": agent_builder_call,
        "eval_gate": eval_gate,
        "human_checkpoint": human_checkpoint or "用户确认最小路径、candidate agent 是否需要进入 eval，以及 playbook 是否写回。",
    }


def _build_room_state_contract(
    goal_check: Dict[str, Any],
    payload: Dict[str, Any],
    capability_gap_report: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    capability_gap_report = capability_gap_report or payload.get("capability_gap_report", {})
    auth_scope = payload.get("collaboration_contract", {}).get(
        "authorization_scope",
        goal_check.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE)),
    )
    compressed = payload.get("compressed_room_result", {})
    playbook = payload.get("playbook_writeback_proposal", {})
    agent_artifacts = payload.get("agent_artifacts", {})

    artifact_inventory = []
    artifact_specs = [
        ("research_synthesis_artifact", "Research Synthesis Agent", "产品研究卡、协作机制对比表和证据强弱标注。"),
        ("product_critique_artifact", "Product Critic Agent", "产品优点、局限、反例、风险和人审问题。"),
        ("collaboration_design_artifact", "Collaboration Designer Agent", "Agent 介入点、guardrails、人审节点、面试叙事和 playbook 草案。"),
        ("feedback_signal_artifact", "Feedback Triage Agent", "反馈聚类与信号强度。"),
        ("product_iteration_artifact", "Product Iteration Agent", "产品迭代候选、优先级与停止条件。"),
    ]
    for artifact_id, owner, fallback_summary in artifact_specs:
        if agent_artifacts.get(artifact_id):
            artifact_inventory.append(
                {
                    "artifact_id": artifact_id,
                    "owner": owner,
                    "status": "available",
                    "summary": agent_artifacts[artifact_id].get("judgment", fallback_summary),
                }
            )

    evidence_ledger = []
    research_artifact = agent_artifacts.get("research_synthesis_artifact", {})
    for item in research_artifact.get("product_cards", [])[:4]:
        evidence_ledger.append(
            {
                "claim": item.get("product", "-"),
                "evidence": [item.get("collaboration_mechanism", ""), item.get("agent_opportunity", "")],
                "confidence": "medium" if "需" in item.get("evidence_status", "") else "high",
            }
        )
    feedback_artifact = agent_artifacts.get("feedback_signal_artifact", {})
    for item in feedback_artifact.get("clusters", [])[:4]:
        evidence_ledger.append(
            {
                "claim": item.get("cluster", "-"),
                "evidence": item.get("evidence", [])[:2],
                "confidence": item.get("signal_strength", "medium"),
            }
        )

    return {
        "capsule_id": "room_state_capsule_complex_product_research_v1",
        "task_goal": goal_check.get("interpreted_goal", payload.get("task_state", {}).get("goal", "")),
        "current_phase": "ready_for_human_review",
        "can_reopen_window": True,
        "resume_mode": "contract_state_only",
        "confirmed_decisions": [
            "本次只使用已注册 Research Synthesis Agent、Product Critic Agent 和 Collaboration Designer Agent 进入可信执行。",
            "候选 Agent 需要通过评测后才能注册，不在本次直接执行。",
            "未确认外部事实、长期记忆写回和 candidate agent 注册都需要用户确认。",
            "Room 结束后只回传压缩结果、playbook 写回建议和可恢复状态，不回传原始过程。",
        ],
        "open_questions": [
            "是否接受本次最小完成路径。",
            "是否把 Evaluation Agent 放入后续评测。",
            "是否确认保存本次 playbook 写回建议。",
        ],
        "active_constraints": _safe_list(auth_scope.get("blocked")) + [
            "不保存 raw room trace",
            "不把待确认研究资料写成确定事实",
            "不把未确认 candidate agent 当作可信执行单元",
        ],
        "artifact_inventory": artifact_inventory,
        "evidence_ledger": evidence_ledger,
        "agent_outputs_summary": [
            {
                "agent": item.get("agent", "-"),
                "judgment": item.get("judgment", "-"),
                "confidence": item.get("confidence", "medium"),
            }
            for item in payload.get("expert_outputs", [])
        ],
        "blocked_actions": _safe_list(auth_scope.get("blocked")),
        "next_minimal_step": "请用户确认是否采用下一轮最小迭代，并决定是否写回 playbook。",
        "resume_instructions": [
            "新窗口只读取本 capsule、collaboration_contract、capability_gap_report 和必要 artifacts。",
            "继续时先复述 confirmed_decisions，再处理 open_questions。",
            "不得根据丢弃的 raw trace 补充未确认事实。",
            "如需要更多上下文，必须向用户请求，而不是猜测。",
        ],
        "discarded_context": [
            "raw room trace",
            "失败研究草稿",
            "未确认外部事实",
            "与当前阶段无关的中间推理",
        ],
        "compression_confidence": "high" if artifact_inventory and compressed else "medium",
        "requires_human_review": True,
        "playbook_writeback_reference": playbook.get("memory_type", "complex_product_research_room_playbook"),
        "capability_gap_summary": {
            "gap_severity": capability_gap_report.get("gap_severity", "none"),
            "missing_capabilities": capability_gap_report.get("missing_capabilities", []),
            "candidate_agent_count": len(capability_gap_report.get("candidate_agent_specs", [])),
        },
    }


def _fallback_expert_outputs(selected_agents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    outputs = []
    for item in selected_agents:
        capability = item.get("capability", "")
        outputs.append(
            {
                "agent": item.get("agent", "Unknown Agent"),
                "capability": capability,
                "covers_gap": item.get("covers_gap", "outside_radius"),
                "collaboration_mode": item.get("collaboration_mode", "result_first"),
                "judgment": f"{item.get('agent', 'Expert')} 建议把协作收敛成结构化 artifact，而不是开放式群聊。",
                "key_findings": [
                    "当前核心任务是定义最小 Agent team 与协作协议",
                    "需要显式给出 artifact contract、QA 规则、停止条件和 memory 写回边界",
                ],
                "evidence": [
                    "用户目标要求判断需要 builder 哪些 Agent",
                    "任务包含角色分工、冲突处理、revision loop 和 memory writeback",
                ],
                "risks": [
                    "开放式 Swarm 会增加 token 噪音并降低可授权性",
                    "未经确认写回 memory 会污染后续路由",
                ],
                "missing_information": ["实际 Agent 运行日志和质量阈值可在下一版补充"],
                "next_validation_step": "先用一个真实 resume/JD case 验证 Agent team spec 和 QA stop condition。",
                "authorization_impact": "只允许生成协作协议和写回预览，不允许自动执行外部动作。",
                "confidence": "medium",
                "should_be_saved_to_workflow": capability in {
                    "task_decomposition",
                    "role_assignment",
                    "artifact_contract",
                    "qa_conflict_resolution",
                    "memory_writeback",
                    "job_scoring",
                    "resume_evidence",
                    "application_risk_policy",
                },
            }
        )
    return outputs


def _evaluation_payload() -> Dict[str, Any]:
    scores = {
        "single_agent": [4, 2, 4, 3, 5, 4, 3, 2, 3, 2, 1, 5],
        "multi_agent_chat": [2, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2],
        "task_room_protocol": [4, 4, 4, 4, 3, 3, 4, 4, 4, 3, 3, 3],
        "capability_radius_harness": [5, 5, 5, 5, 4, 4, 5, 5, 5, 5, 5, 4],
    }
    return {
        "dimensions": EVAL_DIMENSIONS,
        "scores": scores,
        "badcases": [
            "伪协作：single agent 足够却硬拉多专家",
            "按岗位堆专家，没有能力缺口映射",
            "输出不能转成 execution handoff",
            "自动化边界不清导致误授权",
            "workflow 没有沉淀，任务不可复用",
        ],
        "judge_summary": "Capability-radius harness 在边界清晰度、复用性和可授权性上显著优于普通多 Agent 协作。",
    }


def _normalize_scores(raw_scores: Dict[str, Any], dim_count: int, fallback_scores: Dict[str, List[int]]) -> Dict[str, List[int]]:
    normalized: Dict[str, List[int]] = {}
    names = ["single_agent", "multi_agent_chat", "task_room_protocol", "capability_radius_harness"]
    for name in names:
        arr = raw_scores.get(name, []) if isinstance(raw_scores, dict) else []
        if not isinstance(arr, list):
            arr = []
        clean: List[int] = []
        for item in arr[:dim_count]:
            try:
                value = int(item)
            except Exception:
                value = 3
            clean.append(max(1, min(5, value)))
        if len(clean) < dim_count:
            clean.extend(fallback_scores[name][len(clean) : dim_count])
        normalized[name] = clean
    return normalized


def _build_evaluation_comparison(scores: Dict[str, List[int]]) -> Dict[str, Dict[str, Any]]:
    comparison: Dict[str, Dict[str, Any]] = {}
    for key, values in scores.items():
        avg = round(sum(values) / len(values), 2) if values else 0.0
        comparison[key] = {"average_score": avg}
    return comparison


def _build_review_zones(capability_radius: Dict[str, Any]) -> Dict[str, List[str]]:
    inside = [_capability_label(item.get("capability", "")) for item in capability_radius.get("inside_radius", [])]
    outside = [_capability_label(item.get("capability", "")) for item in capability_radius.get("outside_radius", [])]
    automation = [_capability_label(item.get("capability", "")) for item in capability_radius.get("automation_sensitive", [])]
    delegate = outside + [f"{x}（需审批）" for x in automation]
    return {
        "inside_review": [x for x in inside if x],
        "delegate_with_evidence": [x for x in delegate if x],
    }


def _format_result_markdown(final_result: Dict[str, Any]) -> str:
    rec = final_result.get("final_recommendation", {})
    lines = [
        "# Result Surface",
        "",
        f"- 决策：{rec.get('decision', '-')}",
        f"- 最大阻塞点：{final_result.get('primary_blocker', '-')}",
        f"- 推荐动作：{rec.get('suggested_action', '-')}",
    ]
    return "\n".join(lines)


def _build_final_result(
    goal_check: Dict[str, Any],
    merged: Dict[str, Any],
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> Dict[str, Any]:
    handoff = merged.get("execution_agent_handoff_brief", {}) if isinstance(merged, dict) else {}
    if not isinstance(handoff, dict):
        handoff = {}

    review_zones = _build_review_zones(capability_radius)

    return {
        "goal_summary": {
            "user_goal": goal_check.get("interpreted_goal", ""),
            "header_understanding": "系统先判断 Agent 是否必要，再按能力半径选择 skill-heavy 或 Task Room，并生成可审核的协作协议。",
            "success_criteria": goal_check.get("success_criteria", DEFAULT_SUCCESS_CRITERIA),
            "current_autonomy_level": goal_check.get("current_autonomy_level", "Level 1: Draft with approval"),
            "recommended_autonomy_level": goal_check.get("recommended_autonomy_level", "Level 1: Draft with approval"),
            "authorization_scope": goal_check.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE)),
        },
        "final_recommendation": {
            "decision": merged.get("decision", "建议创建最小 Agent Team（Go）"),
            "reason": merged.get("reason", "当前任务的难点是协作协议和 QA 收敛，不是直接生成最终内容。"),
            "suggested_action": merged.get("authorization_suggestion", "确认 Agent team spec、artifact contract、QA 规则和 memory writeback preview。"),
        },
        "primary_blocker": merged.get("primary_blocker", "如果没有 artifact contract 和 QA/stop condition，多 Agent 会退化成高噪音群聊。"),
        "next_minimal_iteration": _safe_list(merged.get("next_minimal_iteration"))
        or [
            "生成最小 Agent team：Splitter / Rewriter / Critic / Assembler",
            "为每个 Agent 定义 context packet 与 artifact schema",
            "加入 QA rubric、conflict rule、revision loop 和 stop condition",
            "输出 memory writeback preview，等待用户确认后再保存",
        ],
        "execution_agent_handoff_brief": {
            "patch_goal": handoff.get("patch_goal", "实现 Agent Team Builder 结果面板与 memory writeback preview"),
            "files_or_modules_to_touch": _safe_list(handoff.get("files_or_modules_to_touch"))
            or ["agent_team_builder_view", "artifact_contract_panel", "memory_writeback_preview"],
            "acceptance_criteria": _safe_list(handoff.get("acceptance_criteria"))
            or [
                "用户能看到为什么需要或不需要多 Agent",
                "每个 Agent 的输入输出 schema 可见",
                "QA / conflict resolution / stop condition 可见",
                "memory writeback preview 必须在保存前展示",
            ],
            "blocked_actions": _safe_list(handoff.get("blocked_actions"))
            or _safe_list(goal_check.get("authorization_scope", {}).get("blocked")),
            "rollback_condition": str(handoff.get("rollback_condition", "关键指标恶化或出现高风险误触发时回滚")),
            "review_required": bool(handoff.get("review_required", True)),
        },
        "automation_boundary": goal_check.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE)),
        "blocked_automation": _safe_list(merged.get("blocked_automation"))
        or _safe_list(goal_check.get("authorization_scope", {}).get("blocked")),
        "metrics_to_watch": _safe_list(merged.get("metrics_to_watch"))
        or ["Task Room 创建必要性准确率", "无效 Agent 排除率", "QA 返工收敛率", "memory writeback 通过率", "token/noise 成本"],
        "autonomy_update": str(merged.get("autonomy_update", "保持外部动作 Level 1；只允许生成协作协议和写回预览，长期 memory 写回需确认。")),
        "evidence_confidence": {
            "overall_confidence": "medium",
            "evidence": _safe_list(merged.get("evidence")) or ["任务明确要求 Agent team builder、artifact contract、QA 和 memory writeback"],
            "uncertainties": _safe_list(merged.get("unknowns")) or ["下一版需要用真实运行日志评估 Agent team 质量"],
        },
        "risks_unknowns": _safe_list(merged.get("risks")) or ["若过早开放 Swarm 或自动写 memory，会放大噪音和上下文污染"],
        "suggested_next_actions": {
            "low_risk": _safe_list(merged.get("next_actions", {}).get("low_risk")) or ["先保存 Agent team spec 草案"],
            "needs_authorization": _safe_list(merged.get("next_actions", {}).get("needs_authorization"))
            or ["确认是否启用该 Agent team template"],
            "human_confirm_required": _safe_list(merged.get("next_actions", {}).get("human_confirm_required")) or ["长期 memory 写回"],
            "blocked": _safe_list(merged.get("next_actions", {}).get("blocked"))
            or _safe_list(goal_check.get("authorization_scope", {}).get("blocked")),
            "not_recommended": _safe_list(merged.get("next_actions", {}).get("not_recommended")) or ["启用开放式无边界 Agent 群聊"],
        },
        "capability_radius_review": review_zones,
        "collaboration_mode": collaboration_mode,
        "authorization_panel": [
            "Authorize low-risk patch",
            "Ask deeper in my strong area",
            "Challenge expert conclusion",
            "Replace expert",
            "Save as workflow asset",
            "Close Task Room",
        ],
    }


def _build_autonomy_policy_update(goal_check: Dict[str, Any], final_result: Dict[str, Any]) -> Dict[str, Any]:
    scope = goal_check.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE))
    return {
        "current_level": goal_check.get("current_autonomy_level", "Level 1: Draft with approval"),
        "recommended_level": goal_check.get("recommended_autonomy_level", "Level 1: Draft with approval"),
        "allowed_action_classes": _safe_list(scope.get("allowed")),
        "blocked_action_classes": _safe_list(scope.get("blocked")),
        "upgrade_condition": ["连续两轮核心指标达标", "无高风险事故", "回滚触发率低于阈值"],
        "downgrade_condition": ["出现高风险误执行", "核心指标连续恶化", "回滚频繁触发"],
        "review_required": bool(scope.get("review_required", True)),
        "notes": final_result.get("autonomy_update", "按任务类型分层升级自治，不做一次性全局升权。"),
    }


def _render_execution_handoff_md(brief: Dict[str, Any]) -> str:
    lines = [
        "# Execution Agent Handoff Brief",
        "",
        f"- patch_goal: {brief.get('patch_goal', '-')}",
        "- files_or_modules_to_touch:",
    ]
    for item in _safe_list(brief.get("files_or_modules_to_touch")):
        lines.append(f"  - {item}")
    lines.append("- acceptance_criteria:")
    for item in _safe_list(brief.get("acceptance_criteria")):
        lines.append(f"  - {item}")
    lines.append("- blocked_actions:")
    for item in _safe_list(brief.get("blocked_actions")):
        lines.append(f"  - {item}")
    lines.append(f"- rollback_condition: {brief.get('rollback_condition', '-')}")
    lines.append(f"- review_required: {brief.get('review_required', True)}")
    return "\n".join(lines)


def _build_workflow_asset(payload: Dict[str, Any], user_actions: Dict[str, Any] | None = None) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    user_actions = user_actions or {}
    contract = payload.get("collaboration_contract", {})
    capability_radius = payload.get("capability_radius", {})
    final_result = payload.get("final_result", {})
    selected_agents = contract.get("selected_agents", [])
    expert_outputs = payload.get("expert_outputs", [])

    saved_by_output = {
        item.get("agent")
        for item in expert_outputs
        if isinstance(item, dict) and item.get("should_be_saved_to_workflow")
    }
    preferred_team = [x.get("agent") for x in selected_agents if x.get("agent") in saved_by_output] or [
        x.get("agent") for x in selected_agents if x.get("agent")
    ]

    delegated_capabilities = [
        item.get("capability")
        for item in capability_radius.get("outside_radius", []) + capability_radius.get("automation_sensitive", [])
        if item.get("capability")
    ]

    workflow_asset = {
        "workflow_asset": {
            "name": "Agent Collaboration Harness Pattern",
            "trigger": "用户需要判断是否让 Agent 介入，或需要 builder 一个最小 Agent team 完成复杂任务",
            "user_strengths": [
                item.get("capability")
                for item in capability_radius.get("inside_radius", [])
                if item.get("capability")
            ],
            "delegated_capabilities": delegated_capabilities,
            "preferred_expert_team": preferred_team,
            "automation_boundary": contract.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE)),
            "review_policy": {
                "inside_radius_detail_level": "high",
                "outside_radius_detail_level": "summary_with_evidence",
                "automation_sensitive_detail_level": "boundary_first",
                "approval_required": True,
            },
            "reuse_condition": [
                "task_requires_agent_necessity_check",
                "task_requires_agent_team_builder",
                "task_has_human_checkpoint_or_memory_writeback",
            ],
            "source_primary_blocker": final_result.get("primary_blocker", ""),
            "memory_writeback_preview": {
                "memory_type": "collaboration_harness_memory",
                "requires_user_approval": True,
                "user_capability_profile": {
                    "inside_radius": [
                        item.get("capability")
                        for item in capability_radius.get("inside_radius", [])
                        if item.get("capability")
                    ],
                    "outside_radius": [
                        item.get("capability")
                        for item in capability_radius.get("outside_radius", [])
                        if item.get("capability")
                    ],
                    "automation_sensitive": [
                        item.get("capability")
                        for item in capability_radius.get("automation_sensitive", [])
                        if item.get("capability")
                    ],
                },
                "delegation_policy_memory": contract.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE)),
                "agent_team_template": {
                    "preferred_team": preferred_team,
                    "merge_rule": contract.get("merge_rule", ""),
                    "stop_condition": "Only save when the result surface has clear blocked actions, QA outcome, and human checkpoint.",
                },
                "context_hygiene_rule": "Only compressed workflow, policy, and capability preferences are written back; raw traces and unconfirmed evidence are discarded.",
            },
            "updated_at": datetime.now().isoformat(timespec="seconds"),
        }
    }

    team_update = {
        "accepted_experts": preferred_team,
        "replaced_experts": _safe_list(user_actions.get("replaced_experts")),
        "experts_to_try_next": _safe_list(user_actions.get("experts_to_try_next")),
        "saved_preferences": [
            "开放判断默认结果优先并附证据",
            "自动化相关任务必须显示 blocked actions",
            "长期 memory 写回必须先展示 preview",
        ],
    }
    return workflow_asset, team_update


def _apply_workflow_and_personalization(payload: Dict[str, Any], user_actions: Dict[str, Any] | None = None) -> Dict[str, Any]:
    workflow_asset, team_update = _build_workflow_asset(payload, user_actions=user_actions)
    payload["workflow_asset"] = workflow_asset
    payload["personalized_expert_team_update"] = team_update
    return payload


def _fallback_task_room(
    goal_check: Dict[str, Any],
    capability_boundary: str,
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> Dict[str, Any]:
    if _looks_like_product_research_task(goal_check.get("interpreted_goal", "")):
        return _fallback_product_research_room(goal_check, capability_boundary, capability_radius, collaboration_mode)

    payload = deepcopy(load_json(DATA_DIR / "fallback_outputs.json"))

    payload["goal_check"] = goal_check
    payload["capability_radius"] = capability_radius
    payload["collaboration_mode"] = collaboration_mode
    payload["runtime_decision"] = build_runtime_decision(goal_check, capability_radius)

    payload["minimum_completion_path"] = {
        "success_criteria": goal_check.get("success_criteria", []),
        "minimum_completion_path": goal_check.get("minimum_completion_path", []),
        "required_capabilities": goal_check.get("required_capabilities", []),
    }

    payload.setdefault("task_state", {})
    payload["task_state"]["goal"] = goal_check.get("interpreted_goal", payload["task_state"].get("goal", ""))
    payload["task_state"]["current_autonomy_level"] = goal_check.get(
        "current_autonomy_level", payload["task_state"].get("current_autonomy_level", "Level 1: Draft with approval")
    )
    payload["task_state"]["recommended_autonomy_level"] = goal_check.get(
        "recommended_autonomy_level", payload["task_state"].get("recommended_autonomy_level", "Level 1: Draft with approval")
    )
    payload["task_state"]["automation_risk"] = goal_check.get("automation_risk", payload["task_state"].get("automation_risk", "medium"))

    payload.setdefault("collaboration_contract", {})
    payload["collaboration_contract"]["selected_agents"] = goal_check.get(
        "minimum_viable_team", payload["collaboration_contract"].get("selected_agents", [])
    )
    payload["collaboration_contract"]["excluded_agents"] = goal_check.get(
        "excluded_agents", payload["collaboration_contract"].get("excluded_agents", [])
    )
    payload["collaboration_contract"]["authorization_scope"] = goal_check.get(
        "authorization_scope", payload["collaboration_contract"].get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE))
    )
    payload["collaboration_contract"]["why_task_room"] = goal_check.get(
        "why",
        "需要构建最小 Agent team，并定义 artifact contract、QA / conflict resolution、stop condition 和 memory writeback preview。",
    )
    payload["collaboration_contract"]["merge_rule"] = (
        "先确认 Agent 是否必要，再定义最小 Agent team，然后生成 artifact contract，"
        "最后合并 QA / conflict resolution / stop condition 与 memory writeback preview。"
    )
    payload["collaboration_contract"]["success_criteria"] = (
        "用户能判断需要哪些 Agent、每个 Agent 交付什么、如何质检收敛，以及哪些 memory 可以确认写回。"
    )

    payload["context_packets"] = _build_context_packets(goal_check, capability_boundary, capability_radius, collaboration_mode)

    selected_names = [x.get("agent") for x in payload["collaboration_contract"].get("selected_agents", [])]
    template_names = [
        x.get("agent")
        for x in load_json(DATA_DIR / "fallback_outputs.json").get("collaboration_contract", {}).get("selected_agents", [])
    ]
    if selected_names != template_names:
        payload["expert_outputs"] = _fallback_expert_outputs(payload["collaboration_contract"].get("selected_agents", []))
    else:
        payload["expert_outputs"] = _fallback_expert_outputs(payload["collaboration_contract"].get("selected_agents", []))

    merged: Dict[str, Any] = {}
    payload["final_result"] = _build_final_result(goal_check, merged, capability_radius, collaboration_mode)
    payload["execution_handoff_brief"] = payload["final_result"].get("execution_agent_handoff_brief", {})
    payload["autonomy_policy_update"] = _build_autonomy_policy_update(goal_check, payload["final_result"])
    payload["memory_patch"] = {
        "stable_user_profile": {
            "strengths": [_capability_label(x.get("capability", "")) for x in capability_radius.get("inside_radius", [])],
            "blind_spots": [_capability_label(x.get("capability", "")) for x in capability_radius.get("outside_radius", [])],
            "automation_sensitive": [
                _capability_label(x.get("capability", "")) for x in capability_radius.get("automation_sensitive", [])
            ],
        },
        "confirmed_preferences": [
            "先判断 Agent 是否必要，再决定是否创建 Task Room",
            "多 Agent 协作必须有 artifact contract、QA 和 stop condition",
            "长期 memory 写回必须先展示 preview",
        ],
        "writeback_reason": "这些偏好可以提升后续 Agent 协作路由、授权边界和 context hygiene。",
    }
    payload["playbook_update"] = {
        "title": "Agent Collaboration Harness Playbook",
        "steps": [
            "判断 Agent 是否必要",
            "选择 single agent / skill-heavy / Task Room runtime",
            "定义最小 Agent team 或 skill pipeline",
            "输出 allowed / needs approval / blocked",
            "展示 memory writeback preview 并等待用户确认",
        ],
        "when_to_use": [
            "需要判断人和 Agent 如何共同推进真实工作流",
            "需要判断为了最终任务 builder 什么样的 Agent team",
        ],
    }
    payload["capability_gap_report"] = _build_capability_gap_report(
        goal_check,
        registered_agents=payload["collaboration_contract"].get("selected_agents", []),
        covered_by_skills=[],
        missing_capabilities=[],
        gap_severity="none",
        minimal_path=goal_check.get("minimum_completion_path", []),
        human_checkpoint="确认当前最小 Agent team 是否足够；如发现新能力缺口，再进入 candidate agent spec 和 eval gate。",
    )

    ev = _evaluation_payload()
    ev["comparison"] = _build_evaluation_comparison(ev["scores"])
    payload["evaluation"] = ev

    payload["meta"] = {
        "mode": "v0-fallback",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "warning": "当前 Task Room 使用 fallback 样例输出。",
    }

    return _apply_workflow_and_personalization(payload)


def _fallback_product_research_room(
    goal_check: Dict[str, Any],
    capability_boundary: str,
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> Dict[str, Any]:
    local_agent_run = run_registered_agents()

    registered_agents = [
        {
            "agent": item.get("agent", ""),
            "capability": item.get("capability", ""),
            "why_selected": item.get("why_selected", ""),
            "source": item.get("source", "agent_manifest.json"),
            "status": item.get("status", "registered"),
        }
        for item in local_agent_run.get("registered_agents", [])
    ]
    candidate_agents = [
        {
            "agent": "Evaluation Agent",
            "capability": "evaluation_design",
            "why_excluded": "当前先展示 Pilot Eval 表，不把 Evaluation Agent 作为可信执行单元。",
            "status": "candidate_only",
        }
    ]
    candidate_agent_specs = [
        _candidate_agent_spec(
            "Evaluation Agent",
            "evaluation_design",
            "后续需要系统评估 Router / Room Controller 的路由准确率、噪音和复用质量；当前 demo 只展示 5 行 Pilot Eval。",
        ),
    ]

    auth_scope = goal_check.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE))

    payload: Dict[str, Any] = {
        "route_id": "example_b_complex_product_research_room",
        "runtime": "dynamic_task_room",
        "room_lifecycle": [
            {"step": "forked", "owner": "Header Agent", "output": "复杂产品研究 Room created with scoped boundary"},
            {"step": "contract_created", "owner": "Room Controller", "output": "目标、证据策略、Agent 角色和交付物 contract 已生成"},
            {"step": "running_room_skills", "owner": "Room Controller", "output": "资料读取、目标产品列表整理、artifact index 初始化"},
            {"step": "running_registered_agents", "owner": "Room Controller", "output": "三个已注册 Agent 分别产出研究、批判和协作设计 artifact"},
            {"step": "candidate_agent_check", "owner": "Room Controller", "output": "Evaluation Agent 仅作为 candidate spec，等待后续评测"},
            {"step": "closed", "owner": "Header Agent", "output": "compressed result、capsule 和 playbook draft returned；raw room trace discarded"},
        ],
        "room_local_skills": [
            {
                "skill_id": "research_brief_loader_skill",
                "status": "completed",
                "input": "target_products=Linear, Slack, 飞书, Paperclip, Symphony",
                "output": "研究对象、证据策略、待确认产品资料清单",
            },
            {
                "skill_id": "artifact_indexer_skill",
                "status": "completed",
                "input": "registered agent outputs",
                "output": "research_synthesis_artifact, product_critique_artifact, collaboration_design_artifact",
            },
            {
                "skill_id": "collaboration_memory_writer_skill",
                "status": "preview_only",
                "input": "compressed result + human checkpoint",
                "output": "complex product research playbook writeback proposal",
            },
        ],
        "merge_rule": "先把研究事实与推断分开，再由 Product Critic 找局限和反例，最后只允许 Collaboration Designer 基于上游 artifact 生成 Agent 介入点、guardrails 和面试叙事。",
        "qa_gate": {
            "rubric": ["事实/推断是否分离", "是否覆盖目标产品", "是否避免无脑多 Agent", "是否保留人审与授权边界", "是否能形成可复用 playbook"],
            "stop_condition": "输出产品对比、局限反例、Agent 介入点、guardrails、3 分钟观点和 playbook draft；未确认资料必须标注 unknown。",
            "passed": True,
        },
        "policy": auth_scope,
    }

    payload["goal_check"] = goal_check
    payload["capability_radius"] = capability_radius
    payload["collaboration_mode"] = collaboration_mode
    payload["runtime_decision"] = build_runtime_decision(goal_check, capability_radius)
    payload["minimum_completion_path"] = {
        "success_criteria": goal_check.get("success_criteria", []),
        "minimum_completion_path": goal_check.get("minimum_completion_path", []),
        "required_capabilities": goal_check.get("required_capabilities", []),
    }

    payload.setdefault("task_state", {})
    payload["task_state"]["room_name"] = "Complex Product Research Room"
    payload["task_state"]["status"] = "completed_with_compressed_result"
    payload["task_state"]["goal"] = goal_check.get("interpreted_goal", "")
    payload["task_state"]["why_task_room"] = goal_check.get(
        "why",
        "跨产品研究、批判、协作设计和评估指标需要多个能力按 contract 协作，不能用单个 Skill 或开放式群聊替代。",
    )
    payload["task_state"]["context_scope"] = "temporary_room_context"
    payload["task_state"]["current_autonomy_level"] = goal_check.get("current_autonomy_level", "Level 1: Draft with approval")
    payload["task_state"]["recommended_autonomy_level"] = goal_check.get(
        "recommended_autonomy_level", "Level 2: Build agent team spec after approval"
    )
    payload["task_state"]["automation_risk"] = goal_check.get("automation_risk", "medium")

    payload["collaboration_contract"] = {
        "why_task_room": payload["task_state"]["why_task_room"],
        "selected_agents": registered_agents,
        "excluded_agents": candidate_agents,
        "authorization_scope": auth_scope,
        "merge_rule": payload["merge_rule"],
        "success_criteria": "Room 只组合 registered agents；candidate agents 只提出规格，不进入可信执行。",
        "room_context_policy": {
            "context_scope": "temporary_room_context",
            "return_to_main_context": ["compressed_room_result", "playbook_writeback_proposal", "candidate_agent_specs"],
            "discard": ["raw room trace", "failed drafts", "unconfirmed external facts"],
        },
    }

    payload["context_packets"] = [
        {
            "agent": item.get("agent", ""),
            "capability": item.get("capability", ""),
            "source": item.get("source", "agent_manifest.json"),
            "task": "在 Complex Product Research Room 内按 artifact contract 产出结构化 artifact。",
            "expected_output": item.get("output_contract", item.get("artifact_contract", [])),
        }
        for item in local_agent_run.get("registered_agents", [])
    ]

    payload["registered_agents"] = local_agent_run.get("registered_agents", [])
    payload["candidate_agents"] = candidate_agents
    payload["agent_artifacts"] = local_agent_run.get("agent_artifacts", {})
    payload["expert_outputs"] = local_agent_run.get("expert_outputs", [])
    gap_goal_check = dict(goal_check)
    gap_goal_check["required_capabilities"] = list(
        dict.fromkeys(
            _safe_list(goal_check.get("required_capabilities"))
            + ["evaluation_design", "memory_writeback"]
        )
    )
    payload["capability_gap_report"] = _build_capability_gap_report(
        gap_goal_check,
        registered_agents=payload["registered_agents"],
        covered_by_skills=[
            {
                "skill_id": "research_brief_loader_skill",
                "capability": "research_brief_loading",
                "covers": ["target_products", "evidence_policy", "known_unknowns"],
                "status": "room_local_skill",
            },
            {
                "skill_id": "artifact_indexer_skill",
                "capability": "artifact_indexing",
                "covers": ["research_synthesis_artifact", "product_critique_artifact", "collaboration_design_artifact"],
                "status": "room_local_skill",
            },
            {
                "skill_id": "collaboration_memory_writer_skill",
                "capability": "memory_writeback",
                "covers": ["playbook_writeback_proposal"],
                "status": "harness_service",
            },
        ],
        missing_capabilities=["evaluation_design"],
        candidate_agent_specs=candidate_agent_specs,
        gap_severity="recoverable",
        minimal_path=[
            "本次只使用已注册 Research Synthesis、Product Critic、Collaboration Designer 三个 Agent 完成可交付结果。",
            "Evaluation Agent 先保留为 candidate spec，不进入可信执行。",
            "未确认资料全部标记为待确认，不作为强事实。",
            "成功后只写回 playbook proposal；多次复用稳定后再考虑注册/升级 agent 或 skill。",
        ],
        human_checkpoint="确认本次是否接受最小路径；确认 Evaluation Agent 是否进入后续评测；确认 playbook 是否写回。",
    )
    if local_agent_run.get("merge_summary"):
        payload["compressed_room_result"] = {
            **local_agent_run["merge_summary"],
        }
    payload["playbook_writeback_proposal"] = {
        "memory_type": "complex_product_research_room_playbook",
        "requires_user_approval": True,
        "candidate_playbook": "复杂产品研究 Room：输入研究目标 -> Research Synthesis 结构化资料 -> Product Critic 找局限和反例 -> Collaboration Designer 产出 Agent 介入点、guardrails、面试叙事和 playbook -> 人审后写回。",
        "do_not_save": ["raw room trace", "failed drafts", "unconfirmed external facts", "private workspace content"],
    }
    payload["room_state_contract"] = _build_room_state_contract(
        gap_goal_check,
        payload,
        payload.get("capability_gap_report", {}),
    )

    final_result = {
        "goal_summary": {
            "user_goal": goal_check.get("interpreted_goal", ""),
            "header_understanding": "Header Agent fork 临时 Complex Product Research Room；Room Controller 调用 room-local skills 和 registered agents，结束后只回传压缩结果。",
            "success_criteria": goal_check.get("success_criteria", []),
            "authorization_scope": auth_scope,
        },
        "final_recommendation": {
            "decision": payload.get("compressed_room_result", {}).get("decision", "Go"),
            "reason": payload.get("compressed_room_result", {}).get("reason", payload.get("compressed_room_result", {}).get("summary", "")),
            "suggested_action": "补齐每个产品 1 页研究卡，并用 5 行 Pilot Eval 验证 Router/Room Controller 判断力。",
        },
        "primary_blocker": "Paperclip / Symphony 等新兴产品资料不足，必须把待确认事实和推断分开。",
        "next_minimal_iteration": payload.get("compressed_room_result", {}).get("recommended_iteration_plan", []),
        "metrics_to_watch": ["路由判断准确率", "无效 Agent 排除率", "证据可追溯性", "人审负担", "playbook 复用质量"],
        "automation_boundary": auth_scope,
        "blocked_automation": _safe_list(auth_scope.get("blocked")),
        "execution_agent_handoff_brief": {
            "patch_goal": "实现复杂产品研究 Room 的结果面板、注册 Agent 展示、候选 Evaluation Agent 和 Pilot Eval 表。",
            "files_or_modules_to_touch": ["room_lifecycle_panel", "registered_agents_panel", "candidate_agent_specs_panel", "pilot_eval_panel"],
            "acceptance_criteria": [
                "用户能看到 Header / Room Controller 职责分离",
                "用户能看到 room-local skills 和 registered agents 的区别",
                "Product Critic Agent 和 Collaboration Designer Agent 的输入来自上游 artifact",
                "candidate Evaluation Agent 不进入可信执行",
                "room 结束后只回传 compressed result、capsule 和 playbook proposal",
            ],
            "blocked_actions": _safe_list(auth_scope.get("blocked")),
            "rollback_condition": "如果页面重新表现成开放式多 Agent 群聊，则回滚。",
            "review_required": True,
        },
        "capability_radius_review": _build_review_zones(capability_radius),
        "collaboration_mode": collaboration_mode,
        "authorization_panel": [
            "Approve playbook writeback",
            "Challenge research claim",
            "Reject candidate agent",
            "Close Room",
        ],
    }
    payload["final_result"] = final_result
    payload["execution_handoff_brief"] = final_result["execution_agent_handoff_brief"]
    payload["autonomy_policy_update"] = _build_autonomy_policy_update(goal_check, final_result)
    payload["memory_patch"] = {
        "stable_user_profile": {
            "strengths": [_capability_label(x.get("capability", "")) for x in capability_radius.get("inside_radius", [])],
            "blind_spots": [_capability_label(x.get("capability", "")) for x in capability_radius.get("outside_radius", [])],
        },
        "confirmed_preferences": [
            "Room 内 raw trace 不写回主 context",
            "candidate agents 需要 Pilot Eval 后才能注册",
            "待确认研究资料必须标记 unknown，不能写成事实",
        ],
        "writeback_reason": "这些偏好能稳定提升后续 Room fork、授权边界和 context hygiene。",
    }
    payload["playbook_update"] = {
        "title": "Complex Product Research Room Playbook",
        "steps": [
            "Header Agent fork 临时 Room",
            "Room Controller 生成研究 contract 和证据策略",
            "Research Synthesis Agent 输出产品研究卡与对比表",
            "Product Critic Agent 输出局限、反例和风险",
            "Collaboration Designer Agent 输出 Agent 介入点、guardrails 和面试叙事",
            "输出 compressed result、Room Capsule 和 playbook writeback proposal",
        ],
        "when_to_use": ["需要完成复杂产品研究、竞品判断、协作机制设计或面试观点沉淀"],
    }
    payload["evaluation"] = _evaluation_payload()
    payload["evaluation"]["comparison"] = _build_evaluation_comparison(payload["evaluation"]["scores"])
    payload["meta"] = {
        "mode": "v0.8-complex-product-research-room-fallback",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "warning": "当前 Complex Product Research Room 使用 fallback/stub 数据，Paperclip / Symphony 资料标记为待确认。",
    }

    return _apply_workflow_and_personalization(payload)


def _live_task_room(
    goal_check: Dict[str, Any],
    capability_boundary: str,
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
    model: str,
    provider: str,
) -> Dict[str, Any]:
    manifest = load_json(DATA_DIR / "agent_manifest.json")
    client = LLMClient(model=model, provider=provider)

    header_prompt = read_text(PROMPTS_DIR / "header_select_agents.md")
    expert_prompt = read_text(PROMPTS_DIR / "expert_agent.md")
    merge_prompt = read_text(PROMPTS_DIR / "merge_agent.md")
    judge_prompt = read_text(PROMPTS_DIR / "judge_agent.md")

    goal_text = goal_check.get("interpreted_goal", "")
    header_user = (
        f"用户目标：\n{goal_text}\n\n"
        f"Goal Check：\n{json.dumps(goal_check, ensure_ascii=False, indent=2)}\n\n"
        f"Capability Radius：\n{json.dumps(capability_radius, ensure_ascii=False, indent=2)}\n\n"
        f"可选专家 manifest：\n{json.dumps(manifest, ensure_ascii=False, indent=2)}"
    )
    header = client.chat_json(header_prompt, header_user)

    default_selected, default_excluded = select_experts_by_radius(goal_check, capability_radius, collaboration_mode)
    selected_agents = _normalize_team(header.get("selected_agents"), default_selected)
    selected_agents = _enrich_selected_agents(selected_agents, capability_radius, collaboration_mode)
    excluded_agents = _normalize_excluded(header.get("excluded_agents"), default_excluded)
    auth_scope = _normalize_auth_scope(header.get("authorization_scope"), goal_check.get("authorization_scope", deepcopy(DEFAULT_AUTHORIZATION_SCOPE)))

    goal_check = dict(goal_check)
    goal_check["minimum_viable_team"] = selected_agents
    goal_check["excluded_agents"] = excluded_agents
    goal_check["authorization_scope"] = auth_scope

    packets = _build_context_packets(goal_check, capability_boundary, capability_radius, collaboration_mode)

    expert_outputs: List[Dict[str, Any]] = []
    for packet in packets:
        prompt = (
            f"context_packet:\n{json.dumps(packet, ensure_ascii=False, indent=2)}\n\n"
            f"capability_radius:\n{json.dumps(capability_radius, ensure_ascii=False, indent=2)}\n\n"
            f"用户目标：{goal_text}"
        )
        raw = client.chat_json(expert_prompt, prompt)
        expert_outputs.append(_validate_expert_output(raw, packet=packet))

    merged = client.chat_json(
        merge_prompt,
        (
            f"用户目标：{goal_text}\n\n"
            f"capability_radius:\n{json.dumps(capability_radius, ensure_ascii=False, indent=2)}\n\n"
            f"专家输出：\n{json.dumps(expert_outputs, ensure_ascii=False, indent=2)}"
        ),
    )

    final_result = _build_final_result(goal_check, merged, capability_radius, collaboration_mode)
    execution_brief = final_result.get("execution_agent_handoff_brief", {})
    autonomy_policy_update = _build_autonomy_policy_update(goal_check, final_result)

    single_text = client.chat_text(
        system_prompt="你是 single agent baseline，请输出简洁中文结论。",
        user_prompt=(
            "请在不创建 Task Room 的情况下回答：Agent 是否必要、下一步、可授权动作与风险。\n\n"
            f"用户目标：{goal_text}\n用户能力边界：{capability_boundary}"
        ),
        temperature=0.3,
    )

    judge_raw = client.chat_json(
        judge_prompt,
        (
            f"single_agent 输出：\n{single_text}\n\n"
            "multi_agent_chat 输出：\n多个角色轮流发言但没有 contract 和 merge rule。\n\n"
            f"task_room 输出：\n{json.dumps(final_result, ensure_ascii=False, indent=2)}"
        ),
    )

    eval_fallback = _evaluation_payload()
    eval_scores = _normalize_scores(judge_raw.get("scores", {}), len(EVAL_DIMENSIONS), eval_fallback["scores"])

    payload: Dict[str, Any] = {
        "goal_check": goal_check,
        "capability_radius": capability_radius,
        "collaboration_mode": collaboration_mode,
        "runtime_decision": build_runtime_decision(goal_check, capability_radius),
        "minimum_completion_path": {
            "success_criteria": goal_check.get("success_criteria", []),
            "minimum_completion_path": goal_check.get("minimum_completion_path", []),
            "required_capabilities": goal_check.get("required_capabilities", []),
        },
        "task_state": {
            "task_room": "ai-product-iteration-loop",
            "status": "waiting_for_user_review",
            "goal": goal_text,
            "current_autonomy_level": goal_check.get("current_autonomy_level", "Level 1: Draft with approval"),
            "recommended_autonomy_level": goal_check.get("recommended_autonomy_level", "Level 1: Draft with approval"),
            "automation_risk": goal_check.get("automation_risk", "medium"),
            "success_criteria": goal_check.get("success_criteria", []),
            "authorization_level": "Level 1: 生成建议，等待确认",
        },
        "collaboration_contract": {
            "why_task_room": header.get("why_task_room", goal_check.get("why", "任务存在必要能力缺口，需要 Task Room")),
            "selected_agents": selected_agents,
            "excluded_agents": excluded_agents,
            "authorization_scope": auth_scope,
            "merge_rule": header.get("merge_rule", "先定位阻塞点，再收敛迭代与交接，最后输出授权策略。"),
            "success_criteria": header.get("success_criteria", "用户可快速判断可授权动作与 blocked actions。"),
        },
        "context_packets": packets,
        "expert_outputs": expert_outputs,
        "single_agent_baseline": {
            "summary": single_text,
            "gaps": ["授权边界不够结构化", "execution handoff 粒度不足", "policy 更新条件不稳定"],
        },
        "multi_agent_chat_baseline": {
            "summary": "多角色群聊但无 contract/merge rule 的对照方式。",
            "gaps": ["噪音高", "冲突难合并", "执行交接不稳定"],
        },
        "execution_handoff_brief": execution_brief,
        "final_result": final_result,
        "memory_patch": {
            "stable_user_profile": {
                "strengths": [_capability_label(x.get("capability", "")) for x in capability_radius.get("inside_radius", [])],
                "blind_spots": [_capability_label(x.get("capability", "")) for x in capability_radius.get("outside_radius", [])],
            },
            "confirmed_preferences": [
                "先看可授权动作，再看协作细节",
                "需要显式看到 blocked actions",
                "偏好低风险一键确认",
            ],
            "writeback_reason": "这些偏好跨任务稳定，可提升后续自治协作效率。",
        },
        "playbook_update": {
            "title": "Agent Team Builder 协作协议",
            "steps": [
                "判断 Agent 是否必要",
                "定义最小 Agent team",
                "生成 artifact contract",
                "定义 QA / conflict resolution / stop condition",
                "生成 memory writeback preview",
            ],
            "when_to_use": ["需要构建新的 Agent team", "需要把 agent-agent collaboration 收敛成可复用协议"],
        },
        "autonomy_policy_update": autonomy_policy_update,
        "evaluation": {
            "dimensions": EVAL_DIMENSIONS,
            "scores": eval_scores,
            "comparison": _build_evaluation_comparison(eval_scores),
            "badcases": eval_fallback["badcases"],
            "judge_summary": judge_raw.get("judge_summary", eval_fallback["judge_summary"]),
        },
        "meta": {
            "mode": "v0.9-live",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "warning": f"实时 LLM 输出可能波动，provider={provider} model={model}，建议与 fallback 对照。",
        },
    }

    return _apply_workflow_and_personalization(payload)


def _persist_workflow_asset_to_data(workflow_asset: Dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "saved_workflow_asset.json").write_text(json.dumps(workflow_asset, ensure_ascii=False, indent=2), encoding="utf-8")


def _persist_task_room_outputs(payload: Dict[str, Any]) -> None:
    save_json("goal_check.json", payload.get("goal_check", {}))
    save_json("capability_radius.json", payload.get("capability_radius", {}))
    save_json("collaboration_mode.json", payload.get("collaboration_mode", {}))
    save_json("runtime_decision.json", payload.get("runtime_decision", {}))
    save_json("minimum_completion_path.json", payload.get("minimum_completion_path", {}))
    save_json("task_state.json", payload.get("task_state", {}))
    save_json("collaboration_contract.json", payload.get("collaboration_contract", {}))
    save_json("capability_gap_report.json", payload.get("capability_gap_report", {}))
    save_json("room_state_contract.json", payload.get("room_state_contract", {}))
    save_json("context_packets.json", payload.get("context_packets", []))
    save_json("expert_outputs.json", payload.get("expert_outputs", []))
    save_json("single_agent_baseline.json", payload.get("single_agent_baseline", {}))
    save_json("execution_handoff_brief.json", payload.get("execution_handoff_brief", {}))
    save_json("memory_patch.json", payload.get("memory_patch", {}))
    save_json("playbook_update.json", payload.get("playbook_update", {}))
    save_json("autonomy_policy_update.json", payload.get("autonomy_policy_update", {}))
    save_json("evaluation.json", payload.get("evaluation", {}))
    save_json("result_surface.json", payload.get("final_result", {}))
    save_json("workflow_asset.json", payload.get("workflow_asset", {}))
    save_json("personalized_expert_team_update.json", payload.get("personalized_expert_team_update", {}))
    save_json("latest_run.json", payload)

    if payload.get("workflow_asset"):
        _persist_workflow_asset_to_data(payload["workflow_asset"])

    if payload.get("final_result"):
        save_markdown("final_result.md", _format_result_markdown(payload["final_result"]))
    if payload.get("playbook_update"):
        title = payload["playbook_update"].get("title", "Playbook Update")
        steps = payload["playbook_update"].get("steps", [])
        save_markdown("playbook_update.md", "\n".join([f"# {title}", ""] + [f"- {x}" for x in steps]))
    if payload.get("execution_handoff_brief"):
        save_markdown("execution_handoff_brief.md", _render_execution_handoff_md(payload["execution_handoff_brief"]))


def _build_single_agent_path(
    goal_check: Dict[str, Any],
    capability_radius: Dict[str, Any],
    collaboration_mode: Dict[str, Any],
) -> Dict[str, Any]:
    is_autojob = any(cap in goal_check.get("required_capabilities", []) for cap in ["job_scoring", "resume_evidence", "application_risk_policy"])
    if is_autojob:
        example = deepcopy(load_json(DATA_DIR / "example_a_auto_jobhunter_fallback.json"))
        example["goal_check"] = goal_check
        example["capability_radius"] = capability_radius
        example["collaboration_mode"] = collaboration_mode
        example["runtime_decision"] = build_runtime_decision(goal_check, capability_radius)
        example["single_agent_answer"] = {
            "summary": "该任务建议走 Auto-JobHunter 的 skill-heavy with human checkpoints 路径，而不是创建 Task Room。",
            "lightweight_plan": goal_check.get("minimum_completion_path") or [
                "搜集公开官网岗位或导入用户提供的 JD",
                "标准化岗位字段并筛选",
                "岗位打分并输出 Top jobs checkpoint",
                "展示 blocked actions，等待用户确认是否进入简历修改或投递阶段",
                "生成 memory writeback preview",
            ],
            "why_no_task_room": goal_check.get("why", example.get("task_state", {}).get("why_no_task_room", "")),
            "authorization_scope": goal_check.get("authorization_scope", example.get("policy", {})),
            "memory_writeback_preview": example.get("result_surface", {}).get("writeback_preview", {}),
        }
        example.setdefault("task_state", {})
        example["task_state"]["status"] = "skill_heavy_path"
        example["task_state"]["goal"] = goal_check.get("interpreted_goal", example["task_state"].get("goal", ""))
        example["task_state"]["why_no_task_room"] = goal_check.get("why", example["task_state"].get("why_no_task_room", ""))
        example["task_state"]["authorization_level"] = "Level 1: 生成建议，等待确认"
        example["policy"] = goal_check.get("authorization_scope", example.get("policy", {}))
        example["minimum_completion_path"] = {
            "success_criteria": goal_check.get("success_criteria", []),
            "minimum_completion_path": goal_check.get("minimum_completion_path", []),
            "required_capabilities": goal_check.get("required_capabilities", []),
        }
        example["capability_gap_report"] = _build_capability_gap_report(
            goal_check,
            registered_agents=[],
            covered_by_skills=[
                {
                    "skill_id": "boss_job_fit_skill",
                    "capability": "job_scoring",
                    "covers": ["job_fetching", "jd_detail_fetching", "normalization", "fit_scoring", "resume_evidence_mapping"],
                    "status": "registered_skill",
                },
                {
                    "skill_id": "human_checkpoint_renderer_skill",
                    "capability": "human_checkpoint",
                    "covers": ["top_jobs_checkpoint", "blocked_actions_surface"],
                    "status": "harness_service",
                },
                {
                    "skill_id": "collaboration_memory_writer_skill",
                    "capability": "memory_writeback",
                    "covers": ["memory_writeback_preview"],
                    "status": "harness_service",
                },
                {
                    "skill_id": "boss_job_fit_skill",
                    "capability": "application_risk_policy",
                    "covers": ["blocked_apply_actions", "read_only_boundary"],
                    "status": "registered_skill",
                },
            ],
            missing_capabilities=[],
            gap_severity="none",
            minimal_path=goal_check.get("minimum_completion_path", []),
            human_checkpoint="本次不调用 Agent Builder；用户只需确认 Top jobs、简历证据、是否进入简历改写/投递阶段和 memory writeback。",
        )
        example["meta"] = {
            "path": "skill_heavy_with_human_checkpoints",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
        }
        return example

    summary = "该任务可先由 single agent 轻量推进，无需立即创建 Task Room。"
    lightweight_plan = [
        "明确 1 个核心成功标准",
        "输出低风险下一步与风险提醒",
        "若出现授权或执行边界问题，再升级 Task Room",
    ]

    return {
        "goal_check": goal_check,
        "capability_radius": capability_radius,
        "collaboration_mode": collaboration_mode,
        "runtime_decision": build_runtime_decision(goal_check, capability_radius),
        "single_agent_answer": {
            "summary": summary,
            "lightweight_plan": lightweight_plan,
            "why_no_task_room": goal_check.get("why", "single agent 足够"),
            "authorization_scope": goal_check.get("authorization_scope", {}),
            "memory_writeback_preview": {
                "memory_type": "skill_heavy_workflow_memory" if is_autojob else "single_agent_preference_memory",
                "requires_user_approval": True,
                "candidate_writeback": "保存 skill-heavy 路由偏好、blocked actions 和 checkpoint 位置。",
            },
        },
        "task_state": {
            "task_room": None,
            "status": "skill_heavy_path" if is_autojob else "single_agent_path",
            "goal": goal_check.get("interpreted_goal", ""),
            "authorization_level": "Level 1: 生成建议，等待确认",
        },
        "meta": {
            "path": "single_agent",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
        },
    }


def run_goal_check(mode: str, user_input: str, capability_boundary: str, model: str, provider: str = "openai") -> Dict[str, Any]:
    if mode == "v0":
        result = _heuristic_goal_check(user_input, capability_boundary)
        meta = {
            "mode": "v0-fallback",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "warning": "当前 Goal Check 使用 fallback 规则。",
        }
    else:
        try:
            result = _goal_check_live(user_input, capability_boundary, model, provider)
            meta = {
                "mode": "v0.9-live",
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "warning": f"Goal Check 使用实时 LLM provider={provider} model={model}，输出可能波动。",
            }
        except Exception as exc:
            result = _heuristic_goal_check(user_input, capability_boundary)
            meta = {
                "mode": "v0-fallback-after-goal-check-failure",
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "warning": f"实时 Goal Check 失败，已回退 fallback：{exc}",
            }

    capability_radius = build_capability_radius(user_input, capability_boundary, result.get("required_capabilities", []))
    collaboration_mode = assign_collaboration_modes(result, capability_radius)
    runtime_decision = build_runtime_decision(result, capability_radius)

    if result.get("recommendation") == "task_room":
        selected, excluded = select_experts_by_radius(result, capability_radius, collaboration_mode)
        result["minimum_viable_team"] = selected
        result["excluded_agents"] = excluded
        result["suggested_experts"] = [x.get("agent") for x in selected if x.get("agent")]

    payload = {
        "goal_check": result,
        "capability_radius": capability_radius,
        "collaboration_mode": collaboration_mode,
        "runtime_decision": runtime_decision,
        "meta": meta,
    }
    save_json("goal_check.json", payload)
    save_json("capability_radius.json", capability_radius)
    save_json("collaboration_mode.json", collaboration_mode)
    save_json("runtime_decision.json", runtime_decision)
    return payload


def run_task_room(mode: str, goal_check: Dict[str, Any], capability_boundary: str, model: str, provider: str = "openai") -> Dict[str, Any]:
    capability_radius = build_capability_radius(
        goal_check.get("interpreted_goal", ""),
        capability_boundary,
        goal_check.get("required_capabilities", []),
    )
    collaboration_mode = assign_collaboration_modes(goal_check, capability_radius)

    if goal_check.get("recommendation") == "clarify":
        payload = {
            "goal_check": goal_check,
            "capability_radius": capability_radius,
            "collaboration_mode": collaboration_mode,
            "runtime_decision": build_runtime_decision(goal_check, capability_radius),
            "meta": {
                "mode": "clarification",
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "warning": "当前输入尚未形成可执行 goal，请先补充信息。",
            },
        }
        save_json("goal_check.json", payload)
        return payload

    if goal_check.get("recommendation") == "single_agent":
        payload = _build_single_agent_path(goal_check, capability_radius, collaboration_mode)
        save_json("single_agent_path.json", payload)
        return payload

    goal_check = dict(goal_check)
    selected, excluded = select_experts_by_radius(goal_check, capability_radius, collaboration_mode)
    goal_check["minimum_viable_team"] = _enrich_selected_agents(selected, capability_radius, collaboration_mode)
    goal_check["excluded_agents"] = excluded

    if mode == "v0":
        payload = _fallback_task_room(goal_check, capability_boundary, capability_radius, collaboration_mode)
    else:
        try:
            payload = _live_task_room(
                goal_check,
                capability_boundary,
                capability_radius,
                collaboration_mode,
                model,
                provider,
            )
        except Exception as exc:
            payload = _fallback_task_room(goal_check, capability_boundary, capability_radius, collaboration_mode)
            payload["meta"]["mode"] = "v0-fallback-after-live-failure"
            payload["meta"]["warning"] = f"实时 Task Room 失败，已回退 fallback：{exc}"

    _persist_task_room_outputs(payload)
    return payload


def run_saved_workflow(
    user_input: str,
    workflow_asset: Dict[str, Any],
    mode: str,
    capability_boundary: str,
    model: str,
    provider: str = "openai",
) -> Dict[str, Any]:
    workflow = workflow_asset.get("workflow_asset", workflow_asset)
    goal_payload = run_goal_check(
        mode=mode,
        user_input=user_input,
        capability_boundary=capability_boundary,
        model=model,
        provider=provider,
    )

    goal_check = dict(goal_payload.get("goal_check", {}))
    if not goal_check.get("executable_goal"):
        return {
            "goal_check": goal_check,
            "capability_radius": goal_payload.get("capability_radius", {}),
            "collaboration_mode": goal_payload.get("collaboration_mode", {}),
            "meta": {
                "mode": "saved-workflow-reuse-blocked",
                "generated_at": datetime.now().isoformat(timespec="seconds"),
                "warning": "当前输入未形成可执行目标，无法复用 workflow。",
            },
        }

    preferred_team = _safe_list(workflow.get("preferred_expert_team"))
    delegated_capabilities = _safe_list(workflow.get("delegated_capabilities"))
    automation_boundary = workflow.get("automation_boundary", {})

    goal_check["recommendation"] = "task_room"
    goal_check["needs_task_room"] = True
    goal_check["single_agent_sufficient"] = False

    required_caps = list(dict.fromkeys(goal_check.get("required_capabilities", []) + delegated_capabilities))
    goal_check["required_capabilities"] = required_caps or DEFAULT_REQUIRED_CAPABILITIES
    goal_check["minimum_completion_path"] = goal_check.get("minimum_completion_path") or deepcopy(DEFAULT_MINIMUM_COMPLETION_PATH)
    goal_check["success_criteria"] = goal_check.get("success_criteria") or deepcopy(DEFAULT_SUCCESS_CRITERIA)

    if isinstance(automation_boundary, dict) and automation_boundary:
        goal_check["authorization_scope"] = {
            "allowed": _safe_list(automation_boundary.get("allowed")) or deepcopy(DEFAULT_AUTHORIZATION_SCOPE["allowed"]),
            "needs_approval": _safe_list(automation_boundary.get("needs_approval"))
            or deepcopy(DEFAULT_AUTHORIZATION_SCOPE["needs_approval"]),
            "blocked": _safe_list(automation_boundary.get("blocked")) or deepcopy(DEFAULT_AUTHORIZATION_SCOPE["blocked"]),
            "review_required": bool(automation_boundary.get("review_required", True)),
        }

    if preferred_team:
        _, by_agent = _manifest_maps()
        preset_team: List[Dict[str, Any]] = []
        for agent_name in preferred_team:
            manifest_item = by_agent.get(agent_name, {})
            preset_team.append(
                {
                    "agent": agent_name,
                    "capability": manifest_item.get("capability", "collaboration_design"),
                    "why_selected": "来自已保存 workflow 的首选专家组合。",
                }
            )
        goal_check["minimum_viable_team"] = preset_team

    payload = run_task_room(
        mode=mode,
        goal_check=goal_check,
        capability_boundary=capability_boundary,
        model=model,
        provider=provider,
    )

    payload["workflow_reuse"] = {
        "using_saved_workflow": workflow.get("name", "Saved Workflow"),
        "inherited": {
            "preferred_expert_team": preferred_team,
            "delegated_capabilities": delegated_capabilities,
            "automation_boundary": goal_check.get("authorization_scope", {}),
            "review_policy": workflow.get("review_policy", {}),
        },
        "recheck_required": [
            "当前任务是否仍属于同类 Agent 协作模式",
            "是否出现新的 automation risk",
            "是否需要替换专家",
        ],
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }

    save_json("saved_workflow_reuse_run.json", payload)
    save_json("latest_run.json", payload)
    return payload
