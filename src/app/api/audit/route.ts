import { NextRequest, NextResponse } from "next/server";
import { bulkArgumentAudit } from "@/lib/anthropic";

export const maxDuration = 90;

export async function POST(req: NextRequest) {
  try {
    const { argumentText } = await req.json();
    if (!argumentText) {
      return NextResponse.json(
        { error: "argumentText required" },
        { status: 400 }
      );
    }
    const result = await bulkArgumentAudit(argumentText);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Audit failed",
      },
      { status: 500 }
    );
  }
}
