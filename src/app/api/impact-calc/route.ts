import { NextRequest, NextResponse } from "next/server";
import { generateImpactCalc } from "@/lib/anthropic-coach";
import { compareImpacts, type ImpactClaim } from "@/lib/strategy-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { affImpact, negImpact, perspective, judgeId, scoring } = body;

    if (scoring && scoring.aff && scoring.neg) {
      const result = compareImpacts(scoring.aff as ImpactClaim, scoring.neg as ImpactClaim);
      return NextResponse.json({ scoringResult: result });
    }

    if (!affImpact || !negImpact) {
      return NextResponse.json(
        { error: "affImpact and negImpact required" },
        { status: 400 }
      );
    }

    const result = await generateImpactCalc(
      affImpact,
      negImpact,
      perspective === "neg" ? "neg" : "aff",
      judgeId || null
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Impact calc failed",
      },
      { status: 500 }
    );
  }
}
