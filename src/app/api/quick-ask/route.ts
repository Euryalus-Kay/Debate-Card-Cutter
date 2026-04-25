import { NextRequest, NextResponse } from "next/server";
import { quickStrategyAdvice } from "@/lib/anthropic";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { question, context, resolution } = await req.json();
    if (!question) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }
    const advice = await quickStrategyAdvice(
      question,
      context || "",
      resolution || ""
    );
    return NextResponse.json({ advice });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Quick ask failed",
      },
      { status: 500 }
    );
  }
}
