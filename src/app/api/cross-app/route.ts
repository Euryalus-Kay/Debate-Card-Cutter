import { NextRequest, NextResponse } from "next/server";
import { suggestCrossApplications } from "@/lib/anthropic-coach";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { ourArguments, theirArguments, speech } = await req.json();
    if (!Array.isArray(ourArguments) || !Array.isArray(theirArguments)) {
      return NextResponse.json(
        { error: "ourArguments and theirArguments must be arrays" },
        { status: 400 }
      );
    }
    const suggestions = await suggestCrossApplications(
      ourArguments,
      theirArguments,
      speech || "rebuttal"
    );
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Cross-app failed",
      },
      { status: 500 }
    );
  }
}
