import { NextRequest } from "next/server";
import { streamCoach } from "@/lib/anthropic-coach";

export const maxDuration = 300;

/**
 * Strategy chat endpoint. Routes to the Anthropic coach so we don't depend on
 * the optional Gemini API key — keeps strategy chat working out of the box.
 */
export async function POST(req: NextRequest) {
  try {
    const { messages, context, resolution, judgeId, side } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Translate the legacy {role: "model"} shape into Anthropic's
    // {role: "user"|"assistant"} shape.
    const normalized = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "model" ? "assistant" : m.role,
      content: m.content,
    })) as Array<{ role: "user" | "assistant"; content: string }>;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            /* ignore */
          }
        }, 4000);

        try {
          for await (const chunk of streamCoach(
            normalized,
            resolution || "",
            side || "either",
            judgeId || null,
            context || ""
          )) {
            send({ text: chunk });
          }
          send({ done: true });
        } catch (err) {
          send({
            error: err instanceof Error ? err.message : "Strategy AI failed",
          });
        } finally {
          clearInterval(keepalive);
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Strategy AI failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
