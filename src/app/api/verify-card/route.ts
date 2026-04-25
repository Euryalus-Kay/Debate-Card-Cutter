import { NextRequest, NextResponse } from "next/server";
import { verifyCardOnline, findRelatedSources } from "@/lib/perplexity";
import { supabase } from "@/lib/supabase";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { cardId, tag, citation, evidence, includeRelated } = await req.json();

    let resolvedTag = tag;
    let resolvedCite = citation;
    let resolvedEvidence = evidence;

    if (cardId && (!tag || !evidence)) {
      const { data } = await supabase
        .from("cards")
        .select("*")
        .eq("id", cardId)
        .maybeSingle();
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

    const cleanEvidence = String(resolvedEvidence).replace(/<[^>]+>/g, " ");

    const verifyPromise = verifyCardOnline(resolvedTag, resolvedCite || "", cleanEvidence);
    const relatedPromise = includeRelated
      ? findRelatedSources(resolvedTag, cleanEvidence)
      : Promise.resolve([]);

    const [verification, related] = await Promise.all([verifyPromise, relatedPromise]);

    return NextResponse.json({
      verification,
      related,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Verify failed",
      },
      { status: 500 }
    );
  }
}
