from pathlib import Path
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from orchestrator import run_goal_check, run_task_room


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


class GoalRequest(BaseModel):
    user_input: str
    capability_boundary: str = "擅长：AI Coding、快速原型、产品构建；希望委托：跨产品研究、产品批判、协作设计、评测指标。"
    mode: str = "v0"
    model: str = "deepseek-v4-pro"
    provider: str = "deepseek"


class TaskRoomRequest(BaseModel):
    goal_check: Dict[str, Any]
    capability_boundary: str = "擅长：AI Coding、快速原型、产品构建；希望委托：跨产品研究、产品批判、协作设计、评测指标。"
    mode: str = "v0"
    model: str = "deepseek-v4-pro"
    provider: str = "deepseek"


app = FastAPI(title="Agent Collaboration Demo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_json(path: Path) -> Any:
    import json

    return json.loads(path.read_text(encoding="utf-8"))


@app.get("/api/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/examples")
def examples() -> Dict[str, Any]:
    return {
        "example_a": _read_json(DATA_DIR / "example_a_auto_jobhunter_fallback.json"),
        "example_b": _read_json(DATA_DIR / "example_b_complex_product_research_fallback.json"),
    }


@app.get("/api/pilot-eval")
def pilot_eval() -> Dict[str, Any]:
    return _read_json(DATA_DIR / "benchmark_cases.json")


@app.post("/api/goal-check")
def goal_check(request: GoalRequest) -> Dict[str, Any]:
    return run_goal_check(
        mode=request.mode,
        user_input=request.user_input,
        capability_boundary=request.capability_boundary,
        model=request.model,
        provider=request.provider,
    )


@app.post("/api/task-room")
def task_room(request: TaskRoomRequest) -> Dict[str, Any]:
    return run_task_room(
        mode=request.mode,
        goal_check=request.goal_check,
        capability_boundary=request.capability_boundary,
        model=request.model,
        provider=request.provider,
    )


@app.post("/api/pilot-eval/{case_id}")
def pilot_eval_case(case_id: str) -> Dict[str, Any]:
    data = _read_json(DATA_DIR / "benchmark_cases.json")
    for item in data.get("pilot_eval_cases", []):
        if item.get("case_id") == case_id:
            return {"case": item, "status": "completed"}
    return {"case_id": case_id, "status": "not_found"}
