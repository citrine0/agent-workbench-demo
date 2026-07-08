#!/usr/bin/env python3
"""Fetch jobs from sample data, a JSON file, or boss-agent-cli."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from normalize_jobs import normalize_jobs


SKILL_DIR = Path(__file__).resolve().parents[1]
SAMPLE_JOBS = SKILL_DIR / "assets" / "sample_jobs.json"
BOSS_BIN = SKILL_DIR.parents[1] / ".venv-boss-agent-cli" / "bin" / "boss"


class FetchError(RuntimeError):
    pass


def load_json_records(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)]
    if isinstance(data, dict):
        for key in ("jobs", "data", "jobList", "items"):
            value = data.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    raise FetchError(f"无法从 {path} 读取岗位列表。")


def fetch_sample_jobs(limit: int) -> list[dict[str, Any]]:
    records = load_json_records(SAMPLE_JOBS)
    return normalize_jobs(records[:limit], source="sample")


def fetch_jobs_file(path: Path, limit: int) -> list[dict[str, Any]]:
    records = load_json_records(path)
    return normalize_jobs(records[:limit], source="jobs_file")


def _boss_executable() -> str:
    if BOSS_BIN.exists():
        return str(BOSS_BIN)
    found = shutil.which("boss")
    if found:
        return found
    raise FetchError("未找到 boss 命令。请先安装 boss-agent-cli。")


def _run_boss_json(
    args: list[str],
    *,
    data_dir: str | None = None,
    cdp_url: str | None = None,
) -> dict[str, Any] | list[Any]:
    try:
        boss_bin = _boss_executable()
    except FetchError:
        raise FetchError("未找到 boss 命令。请先安装 boss-agent-cli。")

    command = [boss_bin]
    if data_dir:
        command.extend(["--data-dir", data_dir])
    if cdp_url:
        command.extend(["--cdp-url", cdp_url])
    command.extend(args)

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        message = result.stderr.strip() or result.stdout.strip()
        raise FetchError(f"boss 命令失败：{message}")
    text = result.stdout.strip()
    if not text:
        raise FetchError("boss 命令没有返回 JSON。")
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise FetchError(f"boss 返回内容不是 JSON：{text[:200]}") from exc


def _extract_jobs_from_boss_payload(payload: dict[str, Any] | list[Any]) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    for key in ("jobs", "data", "jobList", "items"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _extract_jobs_from_boss_payload(value)
            if nested:
                return nested
    return []


def fetch_boss_agent_cli_jobs(
    keyword: str,
    city: str,
    limit: int,
    *,
    data_dir: str | None = None,
    cdp_url: str | None = None,
) -> list[dict[str, Any]]:
    status_payload = _run_boss_json(["status", "--json"], data_dir=data_dir, cdp_url=cdp_url)
    if isinstance(status_payload, dict) and status_payload.get("ok") is False:
        error = status_payload.get("error") or {}
        raise FetchError(f"boss 未登录或登录态不可用：{error.get('message') or error}")

    search_payload = _run_boss_json(
        ["search", keyword, "--city", city, "--json"],
        data_dir=data_dir,
        cdp_url=cdp_url,
    )
    search_jobs = _extract_jobs_from_boss_payload(search_payload)[:limit]
    normalized = normalize_jobs(search_jobs, source="boss-agent-cli")

    detailed_jobs: list[dict[str, Any]] = []
    for job in normalized:
        security_id = job.get("source_id", "")
        if not security_id:
            detailed_jobs.append(job)
            continue
        try:
            detail_args = ["detail", str(security_id), "--json"]
            if job.get("encrypt_job_id"):
                detail_args.extend(["--job-id", str(job["encrypt_job_id"])])
            if job.get("lid"):
                detail_args.extend(["--lid", str(job["lid"])])
            detail_payload = _run_boss_json(detail_args, data_dir=data_dir, cdp_url=cdp_url)
            detail_records = _extract_jobs_from_boss_payload(detail_payload)
            if not detail_records and isinstance(detail_payload, dict):
                detail_records = [detail_payload]
            detail_job = normalize_jobs(detail_records[:1], source="boss-agent-cli-detail")
            detailed_jobs.append({**job, **(detail_job[0] if detail_job else {})})
        except FetchError as exc:
            detailed_jobs.append({**job, "detail_error": str(exc)})
    return detailed_jobs


def fetch_jobs(
    source: str,
    keyword: str,
    city: str,
    limit: int,
    jobs_file: str | None = None,
    data_dir: str | None = None,
    cdp_url: str | None = None,
) -> list[dict[str, Any]]:
    if source == "sample":
        return fetch_sample_jobs(limit)
    if source == "jobs_file":
        if not jobs_file:
            raise FetchError("source=jobs_file 时必须提供 --jobs-file。")
        return fetch_jobs_file(Path(jobs_file), limit)
    if source == "boss-agent-cli":
        return fetch_boss_agent_cli_jobs(
            keyword=keyword,
            city=city,
            limit=limit,
            data_dir=data_dir,
            cdp_url=cdp_url,
        )
    raise FetchError(f"未知 source：{source}")
