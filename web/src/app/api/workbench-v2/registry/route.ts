import { NextResponse } from "next/server";

import { readWorkbenchRegistry } from "@/lib/workbench-v2";

export const runtime = "nodejs";

export async function GET() {
  try {
    const registry = await readWorkbenchRegistry();
    return NextResponse.json({ registry });
  } catch (error) {
    return NextResponse.json(
      {
        status: "registry_error",
        message: error instanceof Error ? error.message : "Failed to read registry.",
      },
      { status: 500 },
    );
  }
}
