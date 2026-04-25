import { NextRequest, NextResponse } from "next/server";
import { generateDrill } from "@/lib/anthropic-coach";
import { DRILL_BANK, findDrills } from "@/lib/drill-bank";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") as
    | Parameters<typeof findDrills>[0]["type"]
    | null;
  const difficulty = req.nextUrl.searchParams.get("difficulty") as
    | Parameters<typeof findDrills>[0]["difficulty"]
    | null;

  const drills = findDrills({
    type: type || undefined,
    difficulty: difficulty || undefined,
  });
  return NextResponse.json(drills.length ? drills : DRILL_BANK);
}

export async function POST(req: NextRequest) {
  try {
    const { type, difficulty, context } = await req.json();
    if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });
    const drill = await generateDrill(
      type,
      difficulty || "varsity",
      context || "Current HS policy debate topic"
    );
    return NextResponse.json(drill);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Drill generation failed",
      },
      { status: 500 }
    );
  }
}
