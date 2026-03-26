import { NextRequest, NextResponse } from "next/server";
import { iterateCard } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { cardId, instruction } = await req.json();

    if (!cardId || !instruction) {
      return NextResponse.json(
        { error: "cardId and instruction are required" },
        { status: 400 }
      );
    }

    // Get current card
    const { data: card, error: fetchError } = await supabase
      .from("cards")
      .select("*")
      .eq("id", cardId)
      .single();

    if (fetchError || !card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Use Claude to iterate
    const result = await iterateCard(
      {
        tag: card.tag,
        evidence_html: card.evidence_html,
        cite: card.cite,
      },
      instruction
    );

    // Update in DB
    const { error: updateError } = await supabase
      .from("cards")
      .update({
        tag: result.tag,
        evidence_html: result.evidence_html,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cardId);

    if (updateError) {
      console.error("Update error:", updateError);
    }

    return NextResponse.json({
      id: cardId,
      tag: result.tag,
      evidence_html: result.evidence_html,
    });
  } catch (error) {
    console.error("Iterate error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Iteration failed" },
      { status: 500 }
    );
  }
}
