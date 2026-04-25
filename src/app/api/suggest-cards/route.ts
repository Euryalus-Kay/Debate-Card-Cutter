import { NextRequest, NextResponse } from "next/server";
import { suggestNewCardsForArgument } from "@/lib/anthropic";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { argumentId, argumentTitle, description, existingCards } = await req.json();

    let resolvedTitle = argumentTitle || "";
    let resolvedDesc = description || "";
    let resolvedCards: Array<{ tag: string; citation: string }> = existingCards || [];

    if (argumentId && (!resolvedTitle || !resolvedCards.length)) {
      const [{ data: arg }, { data: cards }] = await Promise.all([
        supabase.from("arguments").select("*").eq("id", argumentId).single(),
        supabase.from("cards").select("tag,cite").eq("argument_id", argumentId),
      ]);
      if (arg) {
        resolvedTitle = arg.title || resolvedTitle;
        resolvedDesc = arg.description || resolvedDesc;
      }
      if (cards) {
        resolvedCards = cards.map((c) => ({
          tag: c.tag,
          citation: c.cite,
        }));
      }
    }

    if (!resolvedTitle) {
      return NextResponse.json(
        { error: "argumentTitle or argumentId required" },
        { status: 400 }
      );
    }

    const suggestions = await suggestNewCardsForArgument(
      resolvedTitle,
      resolvedCards,
      resolvedDesc
    );
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Suggest failed",
      },
      { status: 500 }
    );
  }
}
