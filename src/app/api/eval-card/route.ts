import { NextRequest, NextResponse } from "next/server";
import { assessEvidence } from "@/lib/anthropic-coach";
import {
  evaluateTagQuality,
  estimateReadTime,
} from "@/lib/strategy-engine";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { tag, citation, evidence, query, fastOnly } = await req.json();
    if (!tag || !evidence) {
      return NextResponse.json(
        { error: "tag and evidence required" },
        { status: 400 }
      );
    }

    const tagEval = evaluateTagQuality(tag);
    const readTime = estimateReadTime(evidence);

    if (fastOnly) {
      return NextResponse.json({
        tag: tagEval,
        readTime,
        deepEvaluation: null,
      });
    }

    const deep = await assessEvidence(citation || "", evidence, query || tag);
    return NextResponse.json({
      tag: tagEval,
      readTime,
      deepEvaluation: deep,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Card eval failed",
      },
      { status: 500 }
    );
  }
}
