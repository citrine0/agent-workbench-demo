#!/usr/bin/env python3
"""Score normalized jobs against a resume or candidate profile."""

from __future__ import annotations

import re
from typing import Any


CORE_TERMS = [
    "agent",
    "multi-agent",
    "workflow",
    "harness",
    "skill",
    "human-in-the-loop",
    "checkpoint",
    "delegation",
    "policy",
    "guardrail",
    "mcp",
    "a2a",
    "artifact",
    "qa",
    "conflict",
    "memory",
    "token",
    "codex",
    "claude code",
    "cursor",
    "协作",
    "任务拆解",
    "角色分配",
    "证据",
    "记忆",
    "评分",
    "原型",
    "产品",
]


DOMAIN_TERMS = [
    "agent collaboration",
    "collaboration harness",
    "agent 工作流",
    "agent 协作",
    "multi-agent workflow",
    "一人公司",
    "developer tool",
    "ai coding",
    "人机协作",
    "协作协议",
]


def _tokens(text: str) -> set[str]:
    lowered = text.lower()
    words = set(re.findall(r"[a-zA-Z][a-zA-Z0-9\-]+", lowered))
    chinese_chunks = set(re.findall(r"[\u4e00-\u9fff]{2,}", text))
    return words | chinese_chunks


def _term_hits(text: str, terms: list[str]) -> list[str]:
    lowered = text.lower()
    return [term for term in terms if term.lower() in lowered]


def _clamp(value: int, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(maximum, value))


def score_job(job: dict[str, Any], resume_text: str, constraints: dict[str, Any] | None = None) -> dict[str, Any]:
    constraints = constraints or {}
    combined_job_text = " ".join(
        [
            str(job.get("title", "")),
            str(job.get("company", "")),
            str(job.get("jd_text", "")),
            " ".join(job.get("requirements", [])),
        ]
    )
    resume_tokens = _tokens(resume_text)
    job_tokens = _tokens(combined_job_text)

    overlap = sorted(job_tokens & resume_tokens)
    core_hits = _term_hits(combined_job_text + "\n" + resume_text, CORE_TERMS)
    job_core_hits = _term_hits(combined_job_text, CORE_TERMS)
    domain_hits = _term_hits(combined_job_text + "\n" + resume_text, DOMAIN_TERMS)

    core_match = _clamp(10 + len(set(job_core_hits) & set(core_hits)) * 3 + min(len(overlap), 12))
    domain_match = _clamp(6 + len(domain_hits) * 4, maximum=20)

    seniority_match = 9
    if any(term in combined_job_text.lower() for term in ["owner", "负责", "主导", "搭建", "设计", "builder"]):
        seniority_match += 4
    if any(term in resume_text.lower() for term in ["demo", "prototype", "harness", "workflow", "原型", "设计"]):
        seniority_match += 2
    seniority_match = _clamp(seniority_match, maximum=15)

    constraint_match = 10
    preferred_city = str(constraints.get("city", "")).strip()
    if preferred_city and preferred_city in str(job.get("city", "")):
        constraint_match += 3
    preferred_keywords = constraints.get("preferred_keywords", [])
    if isinstance(preferred_keywords, str):
        preferred_keywords = [item.strip() for item in preferred_keywords.split(",") if item.strip()]
    constraint_match += min(2, sum(1 for kw in preferred_keywords if kw.lower() in combined_job_text.lower()))
    constraint_match = _clamp(constraint_match, maximum=15)

    evidence_strength = _clamp(2 + min(len(overlap), 5) + min(len(core_hits), 3), maximum=10)

    risk_flags: list[str] = []
    if not job.get("jd_text"):
        risk_flags.append("insufficient_jd_detail")
    if len(overlap) < 4:
        risk_flags.append("weak_resume_overlap")
    if "自动投递" in combined_job_text or "销售" in combined_job_text:
        risk_flags.append("possible_scope_mismatch")

    risk_penalty = min(10, len(risk_flags) * 3)

    total = core_match + domain_match + seniority_match + constraint_match + evidence_strength - risk_penalty
    total = _clamp(total)

    evidence = overlap[:8] or core_hits[:5]
    gaps = []
    if "mcp" in combined_job_text.lower() and "mcp" not in resume_text.lower():
        gaps.append("需要补充 MCP 相关理解或实践证据。")
    if "评估" in combined_job_text and "评估" not in resume_text:
        gaps.append("需要补充 eval / benchmark / token efficiency 证据。")
    if not gaps and risk_flags:
        gaps.append("需要确认 JD 细节和硬性要求。")
    if not gaps:
        gaps.append("建议在作品集第一屏突出 Agent Collaboration Harness，而不是单点工具。")

    return {
        **job,
        "score": total,
        "score_breakdown": {
            "core_capability_match": core_match,
            "domain_direction_match": domain_match,
            "seniority_responsibility_match": seniority_match,
            "constraint_match": constraint_match,
            "evidence_strength": evidence_strength,
            "risk_penalty": risk_penalty,
        },
        "why": _build_why(job, total, job_core_hits, domain_hits),
        "resume_evidence": evidence,
        "gaps": gaps,
        "risk_flags": risk_flags,
        "recommended_action": "进入 Top jobs checkpoint，由用户确认是否针对该岗位改写简历或申请材料。",
    }


def _build_why(job: dict[str, Any], score: int, core_hits: list[str], domain_hits: list[str]) -> str:
    title = job.get("title", "该岗位")
    if score >= 85:
        stance = "高度匹配"
    elif score >= 70:
        stance = "较匹配"
    else:
        stance = "需要谨慎评估"
    signals = core_hits[:4] + domain_hits[:2]
    if signals:
        return f"{title} {stance}，核心信号包括：{', '.join(signals)}。"
    return f"{title} {stance}，但需要更多 JD 细节支撑判断。"


def rank_jobs(jobs: list[dict[str, Any]], resume_text: str, constraints: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    scored = [score_job(job, resume_text, constraints=constraints) for job in jobs]
    return sorted(scored, key=lambda item: item["score"], reverse=True)

