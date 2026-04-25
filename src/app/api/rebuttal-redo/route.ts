import { NextRequest, NextResponse } from "next/server";
import { rebuttalRedo } from "@/lib/anthropic";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { speechType, side, scenario, transcript } = await req.json();
    if (!speechType || !transcript) {
      return NextResponse.json(
        { error: "speechType and transcript required" },
        { status: 400 }
      );
    }
    const result = await rebuttalRedo(
      speechType,
      side === "neg" ? "neg" : "aff",
      scenario || "",
      transcript
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Rebuttal redo failed",
      },
      { status: 500 }
    );
  }
}
