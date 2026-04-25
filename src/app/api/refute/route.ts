import { NextRequest, NextResponse } from "next/server";
import { generateRefutations } from "@/lib/anthropic-coach";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { argument, side, context, count } = await req.json();
    if (!argument) {
      return NextResponse.json({ error: "argument required" }, { status: 400 });
    }
    const result = await generateRefutations(
      argument,
      side === "neg" ? "neg" : "aff",
      context || "",
      Math.min(count || 6, 10)
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Refute failed",
      },
      { status: 500 }
    );
  }
}
