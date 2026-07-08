import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

import { readWorkbenchRegistry, repoPath } from "@/lib/workbench-v2";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function POST() {
  try {
    const registry = await readWorkbenchRegistry();
    const skill = registry.skills.find((item) => item.id === "boss_job_fit_skill");
    const cwd = repoPath("skills", "boss-job-fit", "scripts");
    const { stdout, stderr } = await execFileAsync(
      "python3",
      [
        "run_workflow.py",
        "--source",
        "sample",
        "--keyword",
        "AI产品经理",
        "--city",
        "上海",
        "--limit",
        "5",
      ],
      {
        cwd,
        maxBuffer: 1024 * 1024 * 10,
      },
    );
    const artifact = JSON.parse(stdout);

    return NextResponse.json({
      execution_source: "real_skill_run",
      data_source: "sample",
      skill_id: "boss_job_fit_skill",
      trust_tier: skill?.trust_tier ?? "verified",
      verified_scope: skill?.verified_scope ?? [],
      stderr: stderr.trim() || null,
      artifact,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "boss_skill_error",
        message: error instanceof Error ? error.message : "Failed to run boss job fit skill.",
      },
      { status: 500 },
    );
  }
}
