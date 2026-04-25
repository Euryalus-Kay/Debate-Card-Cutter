import { NextRequest } from "next/server";
import { streamCoach } from "@/lib/anthropic-coach";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { messages, resolution, side, judgeId, prep } = await req.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: unknown) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
        const keepalive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            /* ignore */
          }
        }, 4000);

        try {
          for await (const chunk of streamCoach(
            messages,
            resolution || "",
            side || "either",
            judgeId || null,
            prep || ""
          )) {
            send({ text: chunk });
          }
          send({ done: true });
        } catch (err) {
          send({
            error: err instanceof Error ? err.message : "Coach failed",
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
        error: err instanceof Error ? err.message : "Coach init failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
