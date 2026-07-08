#!/usr/bin/env python3
"""Run local registered agents for the Agent Collaboration Harness demo."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[1]
AGENTS_DIR = BASE_DIR / "agents"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


TARGET_PRODUCTS = ["Linear", "Slack", "飞书", "Paperclip", "Symphony"]


PRODUCT_NOTES = {
    "Linear": {
        "positioning": "面向产品与工程团队的高速度 issue / project / roadmap 协作系统。",
        "collaboration_mechanism": "用强结构、快捷键、轻量状态流和清晰 ownership 降低团队协调成本。",
        "agent_opportunity": "Agent 可以在 issue triage、状态摘要、跨项目依赖提醒和 release note 草稿中介入。",
        "risk": "如果 Agent 自动改优先级或改 owner，会破坏团队对系统状态的信任。",
        "evidence_status": "基于公开产品形态与常见使用经验，需补官方/用户材料复核。",
    },
    "Slack": {
        "positioning": "团队实时沟通与通知中心。",
        "collaboration_mechanism": "频道、线程、bot、工作流和搜索把异步沟通集中到一个事件流。",
        "agent_opportunity": "Agent 可以做频道摘要、任务提取、决策追踪和噪音过滤。",
        "risk": "bot 容易打扰频道、重复发言，且难以承担明确责任。",
        "evidence_status": "基于产品常识归纳，需补 workspace 实际样本验证。",
    },
    "飞书": {
        "positioning": "集即时沟通、文档、审批、日历和低代码为一体的组织协作平台。",
        "collaboration_mechanism": "通过 IM + Docs + Base + 审批把信息流、文档流和业务流连接起来。",
        "agent_opportunity": "Agent 可以在流程审批、知识库问答、会议纪要、跨表更新和执行提醒中介入。",
        "risk": "组织级平台里 Agent 权限边界更复杂，错误写入或越权执行影响更大。",
        "evidence_status": "基于公开产品形态归纳，需结合具体组织场景验证。",
    },
    "Paperclip": {
        "positioning": "面向 Agent 协作或 AI-native 工作流的早期产品/社区信号。",
        "collaboration_mechanism": "强调把 AI 参与工作流的过程、状态和交接显性化。",
        "agent_opportunity": "可作为 Task Room、artifact contract、memory writeback 等概念的参照样本。",
        "risk": "公开资料可能有限，不能把推测当成事实。",
        "evidence_status": "信息不足；需要用户或后续 researcher 补资料。",
    },
    "Symphony": {
        "positioning": "面向多 Agent 或组织协作编排的新兴产品/概念参照。",
        "collaboration_mechanism": "关注 Agent 之间如何分工、交接、审计和被人类监督。",
        "agent_opportunity": "可用于讨论 agent-to-agent protocol、角色边界和评测机制。",
        "risk": "名称与产品形态可能存在歧义，必须标注待确认事实。",
        "evidence_status": "信息不足；需要二次检索确认。",
    },
}


def run_research_synthesis() -> dict[str, Any]:
    product_cards = []
    for product in TARGET_PRODUCTS:
        notes = PRODUCT_NOTES[product]
        product_cards.append(
            {
                "product": product,
                "positioning": notes["positioning"],
                "collaboration_mechanism": notes["collaboration_mechanism"],
                "agent_opportunity": notes["agent_opportunity"],
                "risk": notes["risk"],
                "evidence_status": notes["evidence_status"],
            }
        )

    return {
        "agent": "Research Synthesis Agent",
        "capability": "research_synthesis",
        "covers_gap": "outside_radius",
        "collaboration_mode": "result_first",
        "artifact_type": "research_synthesis_artifact",
        "judgment": "协作产品的核心差异不是有没有聊天入口，而是如何把任务状态、责任边界、证据和下一步动作结构化。",
        "product_cards": product_cards,
        "comparison_table": [
            {"dimension": "状态结构", "strong_examples": ["Linear", "飞书"], "agent_design_implication": "Agent 输出必须落到状态字段或 artifact，而不是只发消息。"},
            {"dimension": "沟通噪音", "strong_examples": ["Slack"], "agent_design_implication": "Agent 需要发言预算、触发条件和静默摘要。"},
            {"dimension": "权限边界", "strong_examples": ["飞书", "Slack"], "agent_design_implication": "外部动作和组织级写入必须 human-in-the-loop。"},
            {"dimension": "Agent 协作显性化", "strong_examples": ["Paperclip", "Symphony"], "agent_design_implication": "需要 contract、handoff、eval 和 memory hygiene。"},
        ],
        "key_findings": [
            "协作产品最重要的不是内容生成，而是责任、状态和上下文连续性。",
            "Agent 介入应优先选择低风险高重复的整理、摘要、路由和检查点。",
            "早期 Agent 协作产品需要证明 bot 不吵、不越权、能被追责。",
        ],
        "evidence": [
            "Linear 通过强结构和 ownership 降低协调成本。",
            "Slack 的 bot 生态说明 Agent 可以进入协作流，但噪音和可信度是主要风险。",
            "飞书的组织级套件说明权限、审批和跨应用写入必须显性化。",
        ],
        "missing_information": [
            "Paperclip / Symphony 需要补充最新公开资料和具体产品形态。",
            "需要真实团队场景验证 Agent 介入是否降低任务完成时间。",
        ],
        "source_quality_notes": "Linear / Slack / 飞书可基于公开产品形态做稳定归纳；Paperclip / Symphony 只能作为待确认研究对象。",
        "risks": ["把新兴产品推测当事实", "只比较功能，不比较协作机制", "忽略用户授权和组织权限"],
        "next_validation_step": "补充每个产品 1 页研究卡：优点、局限、如果加 Agent 会怎么设计。",
        "authorization_impact": "只输出研究归纳；不访问私有 workspace，不伪造未确认资料。",
        "confidence": "medium",
        "should_be_saved_to_workflow": True,
    }


def run_product_critic(research_artifact: dict[str, Any]) -> dict[str, Any]:
    return {
        "agent": "Product Critic Agent",
        "capability": "product_critique",
        "covers_gap": "outside_radius",
        "collaboration_mode": "result_first",
        "artifact_type": "product_critique_artifact",
        "judgment": "Agent 协作产品不能把“更多 Agent”当卖点，真正要解决的是什么时候该安静、什么时候该请求授权、什么时候该把过程压缩成可复用状态。",
        "strengths": [
            "Linear 证明强结构能减少协作摩擦。",
            "Slack 证明 bot 可以进入团队流，但也暴露噪音和可信度问题。",
            "飞书证明组织协作需要权限、审批和跨工具状态一致性。",
        ],
        "limitations": [
            "协作产品研究如果只停留在功能对比，无法回答 Agent 如何成为可信团队成员。",
            "Agent 介入点如果没有触发条件和停止条件，会退化成群聊噪音。",
            "Paperclip / Symphony 的资料不足，不能承担强事实论证。",
        ],
        "counterexamples": [
            "一个普通总结 bot 可能提高短期效率，却降低频道信任，因为它频繁打扰且无法负责。",
            "一个自动改 roadmap 的 Agent 即使建议正确，也可能破坏团队决策边界。",
            "没有 artifact contract 的多 Agent 输出难以合并，不能形成可审计交付物。",
        ],
        "key_findings": [
            "Agent 产品设计要优先定义发言权、写入权和升级到人审的条件。",
            "Task Room 的价值是状态管理和责任边界，不是角色数量。",
            "评估指标应覆盖任务完成率、噪音、授权负担和复用质量。",
        ],
        "evidence": research_artifact.get("key_findings", []),
        "risks": [
            "过度迎合 Agent-native 叙事，忽略普通协作用户的学习成本。",
            "把协议设计讲得过重，掩盖真实产品体验。",
        ],
        "questions_for_human_review": [
            "面试时是否把重点放在协作产品判断，而不是协议术语。",
            "是否需要补 Paperclip / Symphony 的最新资料截图或引用。",
        ],
        "missing_information": research_artifact.get("missing_information", []),
        "next_validation_step": "用 5 个 pilot case 验证 Router 是否会避免无脑开 Task Room。",
        "authorization_impact": "只挑战结论和提出人审问题，不替用户做最终产品判断。",
        "confidence": "medium",
        "should_be_saved_to_workflow": True,
    }


def run_collaboration_designer(
    research_artifact: dict[str, Any],
    critique_artifact: dict[str, Any],
) -> dict[str, Any]:
    entry_points = [
        {
            "entry_point": "频道 / room 摘要",
            "use_agent_when": "信息量大、需要压缩成状态，而不是参与开放讨论。",
            "human_checkpoint": "摘要影响决策或要写入长期记忆前需要确认。",
        },
        {
            "entry_point": "任务路由",
            "use_agent_when": "任务需要判断 Skill、单 Agent、Task Room 或人审路径。",
            "human_checkpoint": "进入外部动作、长期 memory 或 candidate agent 注册前确认。",
        },
        {
            "entry_point": "Artifact contract",
            "use_agent_when": "多个 Agent 产物需要合并、质检和追责。",
            "human_checkpoint": "合约改变任务目标或授权边界时确认。",
        },
    ]

    return {
        "agent": "Collaboration Designer Agent",
        "capability": "collaboration_design",
        "covers_gap": "outside_radius",
        "collaboration_mode": "result_first",
        "artifact_type": "collaboration_design_artifact",
        "judgment": "Agent 应该作为协作 harness 的可控参与者进入工作流：先路由，再拿到局部 contract，输出 artifact，关键点交给人审，结束后只写回压缩 playbook。",
        "agent_entry_points": entry_points,
        "interaction_protocol": [
            "Header 判断：稳定任务走 Skill，开放判断走 Agent，复杂协作走 Task Room。",
            "Room Controller 生成 contract：目标、边界、角色、artifact、done criteria。",
            "Registered Agent 只拿局部 context packet，输出结构化 artifact。",
            "Candidate Agent 只生成 spec，经过 eval gate 和人审后才能注册。",
            "Room 结束只回传 compressed result、capsule 和 playbook draft。",
        ],
        "guardrails": [
            "发言预算：Agent 默认不在协作流中主动刷屏。",
            "写入预算：状态、memory、外部系统写入必须显式授权。",
            "证据预算：未确认资料必须标注 unknown，不能伪造成事实。",
            "降级策略：Skill 足够时不开 Room；缺能力但风险高时只生成 candidate spec。",
        ],
        "human_checkpoints": [
            "确认 Router 是否该开 Task Room。",
            "确认 candidate Evaluation Agent 是否进入后续评测。",
            "确认 playbook draft 是否写入长期记忆。",
        ],
        "interview_narrative": [
            "我不是想证明多 Agent 永远更强，而是设计一个知道何时不用 Agent 的协作 harness。",
            "稳定动作 Skill 化，开放判断 Agent 化，复杂协作 Room 化，能力缺口 candidate 化。",
            "真正的产品价值是降低人的协作负担，同时保留授权、证据和责任边界。",
        ],
        "playbook_draft": "复杂产品研究 Room：输入研究目标 -> Research Synthesis 结构化资料 -> Product Critic 找局限和反例 -> Collaboration Designer 产出 Agent 介入点、guardrails、面试叙事和 playbook -> 人审后写回。",
        "key_findings": [
            "Task Room 应被解释为复杂协作 harness，而不是多 Agent 群聊。",
            "Skill vs Agent 的分界是稳定性和判断强度，不是用户会不会。",
            "Agent Builder 现在只保留 candidate spec 入口，后续再接 eval 和 registry lifecycle。",
        ],
        "evidence": critique_artifact.get("key_findings", []) + research_artifact.get("key_findings", [])[:1],
        "risks": [
            "如果 UI 展示太多内部机制，会稀释主线。",
            "如果没有 pilot eval，会像精心编排的单一路径。",
        ],
        "missing_information": [
            "需要 5 行 pilot eval 记录支撑 Router/Room Controller 判断力。",
            "需要补一份 MCP/A2A 概念映射文档作为后续材料。",
        ],
        "next_validation_step": "用协作决策评测表验证 5 类任务是否正确路由。",
        "authorization_impact": "只生成设计方案和 playbook draft；不自动注册新 Agent，不写长期 memory。",
        "confidence": "medium-high",
        "should_be_saved_to_workflow": True,
    }


def run_registered_agents() -> dict[str, Any]:
    specs = [
        load_json(AGENTS_DIR / "research_synthesis_agent.json"),
        load_json(AGENTS_DIR / "product_critic_agent.json"),
        load_json(AGENTS_DIR / "collaboration_designer_agent.json"),
    ]
    research_artifact = run_research_synthesis()
    critique_artifact = run_product_critic(research_artifact)
    design_artifact = run_collaboration_designer(research_artifact, critique_artifact)

    return {
        "registered_agents": specs,
        "agent_artifacts": {
            "research_synthesis_artifact": research_artifact,
            "product_critique_artifact": critique_artifact,
            "collaboration_design_artifact": design_artifact,
        },
        "expert_outputs": [research_artifact, critique_artifact, design_artifact],
        "merge_summary": {
            "decision": "Go",
            "reason": "复杂产品研究需要跨产品资料归纳、反例批判和 Agent 协作设计，Task Room 比单个长答案更容易保留证据、边界和可复用状态。",
            "recommended_iteration_plan": [
                "产出 Linear / Slack / 飞书 / Paperclip / Symphony 的 1 页研究卡。",
                "把 Agent 介入点收敛为路由、摘要、artifact contract 和人审写回四类。",
                "用 5 行 Pilot Eval 验证 Router 是否避免无脑开 Room。",
            ],
            "qa_notes": [
                "Research Synthesis Agent 负责事实/推测分离。",
                "Product Critic Agent 挑战“更多 Agent 更好”的假设。",
                "Collaboration Designer Agent 只基于上游 artifact 生成协议和面试叙事。",
                "Evaluation Agent 保持 candidate only，不进入可信执行。",
            ],
        },
    }


def main() -> int:
    print(json.dumps(run_registered_agents(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
