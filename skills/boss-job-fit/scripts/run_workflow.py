#!/usr/bin/env python3
"""Run the boss-job-fit workflow."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from fetch_boss_jobs import FetchError, fetch_jobs
from score_jobs import rank_jobs


BLOCKED_ACTIONS = [
    "自动投递",
    "自动打招呼",
    "自动联系招聘方",
    "批量沟通",
    "绕过验证码或风控",
    "编造简历经历",
]


def read_text_file(path: str | None) -> str:
    if not path:
        return ""
    return Path(path).read_text(encoding="utf-8")


def parse_constraints(raw: str | None, city: str) -> dict[str, Any]:
    constraints: dict[str, Any] = {"city": city}
    if not raw:
        return constraints
    try:
        loaded = json.loads(raw)
        if isinstance(loaded, dict):
            constraints.update(loaded)
            return constraints
    except json.JSONDecodeError:
        pass
    constraints["preferred_keywords"] = [item.strip() for item in raw.split(",") if item.strip()]
    return constraints


def build_result(
    *,
    source: str,
    keyword: str,
    city: str,
    limit: int,
    normalized_jobs: list[dict[str, Any]],
    ranked_jobs: list[dict[str, Any]],
) -> dict[str, Any]:
    top_jobs = ranked_jobs[: min(3, len(ranked_jobs))]
    return {
        "skill_id": "boss_job_fit_skill",
        "skill_name": "boss-job-fit",
        "source_metadata": {
            "source": source,
            "keyword": keyword,
            "city": city,
            "limit": limit,
            "jobs_loaded": len(normalized_jobs),
            "jobs_ranked": len(ranked_jobs),
        },
        "normalized_jobs": normalized_jobs,
        "ranked_jobs": ranked_jobs,
        "score_breakdown": [
            {
                "source_id": job.get("source_id", ""),
                "title": job.get("title", ""),
                "company": job.get("company", ""),
                "score": job.get("score", 0),
                "score_breakdown": job.get("score_breakdown", {}),
                "risk_flags": job.get("risk_flags", []),
            }
            for job in ranked_jobs
        ],
        "resume_evidence_map": [
            {
                "source_id": job.get("source_id", ""),
                "title": job.get("title", ""),
                "resume_evidence": job.get("resume_evidence", []),
                "gaps": job.get("gaps", []),
            }
            for job in ranked_jobs
        ],
        "top_jobs_checkpoint": [
            {
                "rank": index + 1,
                "title": job.get("title", ""),
                "company": job.get("company", ""),
                "city": job.get("city", ""),
                "salary": job.get("salary", ""),
                "score": job.get("score", 0),
                "why": job.get("why", ""),
                "resume_evidence": job.get("resume_evidence", []),
                "gaps": job.get("gaps", []),
                "risk_flags": job.get("risk_flags", []),
                "recommended_action": job.get("recommended_action", ""),
            }
            for index, job in enumerate(top_jobs)
        ],
        "blocked_actions": BLOCKED_ACTIONS,
        "human_checkpoints": [
            "确认 Top jobs 是否符合目标方向。",
            "确认每个推荐是否有真实简历/作品集证据支撑。",
            "确认是否允许针对单个岗位改写简历或申请材料。",
            "确认是否保存求职 workflow memory。",
        ],
        "writeback_preview": {
            "requires_user_approval": True,
            "workflow_asset_memory": "BOSS 岗位获取 -> JD 标准化 -> 匹配打分 -> 简历证据映射 -> Top jobs checkpoint。",
            "discard": ["原始简历全文", "未确认岗位事实", "agent trace", "私密沟通内容"],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="运行 boss-job-fit 岗位获取与匹配打分 workflow。")
    parser.add_argument("--source", choices=["sample", "jobs_file", "boss-agent-cli"], default="sample")
    parser.add_argument("--keyword", required=True)
    parser.add_argument("--city", default="")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--resume-file", default=None)
    parser.add_argument("--resume-text", default="")
    parser.add_argument("--constraints", default=None, help="JSON 字符串或逗号分隔关键词。")
    parser.add_argument("--jobs-file", default=None)
    parser.add_argument(
        "--boss-data-dir",
        default="agent-collaboration-demo/.boss-agent-data",
        help="传给 boss-agent-cli 的 --data-dir。",
    )
    parser.add_argument("--boss-cdp-url", default=None, help="传给 boss-agent-cli 的 --cdp-url。")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    resume_text = args.resume_text or read_text_file(args.resume_file)
    if not resume_text:
        resume_text = "候选人正在构建 Agent Collaboration Harness，包含 skill-heavy workflow、Task Room、human checkpoint、memory writeback、token efficiency 和 Codex/Claude Code 工作流实践。"

    try:
        normalized_jobs = fetch_jobs(
            source=args.source,
            keyword=args.keyword,
            city=args.city,
            limit=args.limit,
            jobs_file=args.jobs_file,
            data_dir=args.boss_data_dir,
            cdp_url=args.boss_cdp_url,
        )
    except FetchError as exc:
        result = {
            "skill_id": "boss_job_fit_skill",
            "status": "blocked",
            "error": str(exc),
            "blocked_actions": BLOCKED_ACTIONS,
            "human_checkpoints": ["请用户处理登录、验证码、CLI 安装或数据授权问题后重试。"],
        }
        output = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            Path(args.output).parent.mkdir(parents=True, exist_ok=True)
            Path(args.output).write_text(output + "\n", encoding="utf-8")
        else:
            print(output)
        return 2

    constraints = parse_constraints(args.constraints, city=args.city)
    ranked_jobs = rank_jobs(normalized_jobs, resume_text=resume_text, constraints=constraints)
    result = build_result(
        source=args.source,
        keyword=args.keyword,
        city=args.city,
        limit=args.limit,
        normalized_jobs=normalized_jobs,
        ranked_jobs=ranked_jobs,
    )
    output = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        Path(args.output).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
