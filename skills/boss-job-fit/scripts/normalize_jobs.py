#!/usr/bin/env python3
"""Normalize job records for boss-job-fit."""

from __future__ import annotations

from typing import Any


def _first_value(data: dict[str, Any], keys: list[str], default: str = "") -> str:
    for key in keys:
        value = data.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            return ", ".join(str(item) for item in value if item)
        text = str(value).strip()
        if text:
            return text
    return default


def _list_value(data: dict[str, Any], keys: list[str]) -> list[str]:
    for key in keys:
        value = data.get(key)
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [part.strip() for part in value.replace("，", ",").split(",") if part.strip()]
    return []


def normalize_job(raw: dict[str, Any], source: str = "") -> dict[str, Any]:
    job_info = raw.get("jobInfo", {}) if isinstance(raw.get("jobInfo"), dict) else {}
    brand_info = raw.get("brandComInfo", {}) if isinstance(raw.get("brandComInfo"), dict) else {}
    merged = {**raw, **job_info, **brand_info}

    title = _first_value(merged, ["title", "jobName", "职位", "职位名称", "name"])
    company = _first_value(merged, ["company", "brandName", "公司", "公司名称"])
    city = _first_value(merged, ["city", "cityName", "locationName", "城市", "地区"])
    salary = _first_value(merged, ["salary", "salaryDesc", "薪资"])
    jd_text = _first_value(merged, ["jd_text", "postDescription", "jobDesc", "description", "职位描述"])
    source_id = _first_value(merged, ["source_id", "securityId", "security_id", "职位ID", "id"])
    encrypt_job_id = _first_value(
        merged,
        ["encrypt_job_id", "encryptJobId", "encryptId", "jobId", "job_id", "encrypt_jobId"],
    )
    lid = _first_value(merged, ["lid", "listId", "list_id"])
    source_url = _first_value(merged, ["source_url", "job_link", "url", "link"])
    requirements = _list_value(merged, ["requirements", "skills", "showSkills", "技能"])

    if not requirements and jd_text:
        requirement_terms = [
            "Agent",
            "workflow",
            "multi-agent",
            "human-in-the-loop",
            "MCP",
            "A2A",
            "产品",
            "协作",
            "原型",
            "打分",
            "评估",
        ]
        requirements = [term for term in requirement_terms if term.lower() in jd_text.lower()]

    return {
        "source": source or _first_value(merged, ["source"], "unknown"),
        "source_id": source_id,
        "encrypt_job_id": encrypt_job_id,
        "lid": lid,
        "title": title,
        "company": company,
        "city": city,
        "salary": salary,
        "jd_text": jd_text,
        "requirements": requirements,
        "source_url": source_url,
        "raw_available": bool(raw),
    }


def normalize_jobs(records: list[dict[str, Any]], source: str = "") -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in records:
        if isinstance(item, dict):
            job = normalize_job(item, source=source)
            if job["title"] or job["jd_text"]:
                normalized.append(job)
    return normalized
