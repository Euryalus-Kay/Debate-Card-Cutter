import { NextRequest, NextResponse } from "next/server";
import { simulateCrossX } from "@/lib/anthropic-coach";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { side, argument, judgeId, rounds } = await req.json();
    if (!argument) {
      return NextResponse.json({ error: "argument required" }, { status: 400 });
    }
    const sim = await simulateCrossX(
      side === "neg" ? "neg" : "aff",
      argument,
      judgeId || null,
      Math.min(rounds || 4, 8)
    );
    return NextResponse.json(sim);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "CX sim failed",
      },
      { status: 500 }
    );
  }
}
