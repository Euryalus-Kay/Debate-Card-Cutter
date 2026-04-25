import { NextRequest, NextResponse } from "next/server";
import { adaptToJudge } from "@/lib/anthropic-coach";
import { JUDGE_PARADIGMS, getJudgeById } from "@/lib/judge-paradigms";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const judge = getJudgeById(id);
    if (!judge) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(judge);
  }
  return NextResponse.json(JUDGE_PARADIGMS);
}

export async function POST(req: NextRequest) {
  try {
    const { judgeId, side, topicContext, prepNotes } = await req.json();
    if (!judgeId) {
      return NextResponse.json({ error: "judgeId required" }, { status: 400 });
    }
    const result = await adaptToJudge(
      judgeId,
      side === "neg" ? "neg" : "aff",
      topicContext || "",
      prepNotes || ""
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Judge adaptation failed",
      },
      { status: 500 }
    );
  }
}
