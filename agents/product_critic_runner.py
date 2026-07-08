#!/usr/bin/env python3
"""Run Product Critic Agent against one certification case."""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any
from urllib import request, error


DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions"
DEFAULT_MODEL = "deepseek-v4-pro"


def parse_json_text(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.removeprefix("```json").removeprefix("```").strip()
        if stripped.endswith("```"):
            stripped = stripped[:-3].strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start < 0 or end <= start:
            raise
        return json.loads(stripped[start : end + 1])


def call_deepseek(case: dict[str, Any], api_key: str, model: str) -> dict[str, Any]:
    prompt = "\n".join(
        [
            "你是 Agent Workbench v2 内部的 Product Critic Agent。",
            "请根据给定 certification case 批判这个方案。",
            "只返回严格 JSON，字段形状必须完全一致：",
            '{"risks":["..."],"counterarguments":["..."],"recommendation":"...","human_review_questions":["..."]}',
            "字段名保持英文；数组内容、recommendation 和问题都用中文。",
            "规则：",
            "- 相关时必须明确指出 over-agentization。",
            "- 相关时必须明确保留 evidence / unknowns / human review。",
            "- 相关时必须明确反对把 Agent Workbench 表述成 Slack / Linear / 飞书的直接替代品。",
            "- 不要声称这个 agent 已经 verified。",
            "- 不要建议全自动化或无边界 Task Room 执行。",
            "",
            f"Case ID: {case.get('case_id', '')}",
            f"Title: {case.get('title', '')}",
            f"Input: {case.get('input', '')}",
            f"Expected findings: {json.dumps(case.get('expected_findings', []), ensure_ascii=False)}",
            f"Required terms: {json.dumps(case.get('required_terms', []), ensure_ascii=False)}",
            f"Forbidden recommendations: {json.dumps(case.get('forbidden_recommendations', []), ensure_ascii=False)}",
        ]
    )
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": "为 Product Critic certification 返回严格 JSON。字段名保持英文，展示内容使用中文。"},
            {"role": "user", "content": prompt},
        ],
    }
    req = request.Request(
        DEEPSEEK_ENDPOINT,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "authorization": f"Bearer {api_key}",
            "content-type": "application/json",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"DeepSeek 请求失败: {exc.code} {detail}") from exc
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if not content:
        raise RuntimeError("DeepSeek 响应没有 message content。")
    return parse_json_text(content)


def normalize_artifact(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "risks": [str(item) for item in raw.get("risks", []) if str(item).strip()],
        "counterarguments": [
            str(item) for item in raw.get("counterarguments", []) if str(item).strip()
        ],
        "recommendation": str(raw.get("recommendation", "")).strip(),
        "human_review_questions": [
            str(item) for item in raw.get("human_review_questions", []) if str(item).strip()
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Product Critic Agent certification case.")
    parser.add_argument("--case-json", required=True, help="Certification case JSON string.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print(json.dumps({"error": "missing DEEPSEEK_API_KEY"}, ensure_ascii=False), file=sys.stderr)
        return 2

    case = json.loads(args.case_json)
    artifact = normalize_artifact(call_deepseek(case, api_key, args.model))
    result = {
        "execution_source": "live_llm",
        "provider": "deepseek",
        "agent_id": "product_critic_agent",
        "case_id": case.get("case_id", ""),
        "artifact": artifact,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
