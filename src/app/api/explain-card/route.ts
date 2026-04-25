import { NextRequest, NextResponse } from "next/server";
import { explainCardLikeImFive } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { cardId, tag, citation, evidence } = await req.json();

    let resolvedTag = tag;
    let resolvedCite = citation;
    let resolvedEvidence = evidence;

    if (cardId && (!tag || !evidence)) {
      const { data } = await supabase
        .from("cards")
        .select("*")
        .eq("id", cardId)
        .single();
      if (data) {
        resolvedTag = data.tag;
        resolvedCite = data.cite;
        resolvedEvidence = data.evidence_html;
      }
    }

    if (!resolvedTag || !resolvedEvidence) {
      return NextResponse.json(
        { error: "Need either cardId or { tag, evidence }" },
        { status: 400 }
      );
    }

    const explanation = await explainCardLikeImFive(
      resolvedTag,
      resolvedCite || "",
      String(resolvedEvidence).replace(/<[^>]+>/g, " ")
    );
    return NextResponse.json({ explanation });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Explain failed",
      },
      { status: 500 }
    );
  }
}
