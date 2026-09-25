// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { teams, telemetry, user } from "@/server/db/schema";
import { assertBudget, rateLimit, LIMITS } from "@/server/limits";

let close: () => Promise<void>;
beforeAll(async () => {
  ({ close } = await freshDb());
  await db().insert(user).values({ id: "u1", name: "Deb Ater", email: "u1@example.test" });
  await db().insert(teams).values({ id: "t1", name: "Team", createdBy: "u1", aiMonthlyCapUsd: 1 });
});
afterAll(async () => close());

describe("AI guards", () => {
  it("a burst past the limit gets a plain 429", async () => {
    for (let i = 0; i < LIMITS.file_build.n; i++) await rateLimit("file_build", "u1");
    await expect(rateLimit("file_build", "u1")).rejects.toMatchObject({ status: 429 });
    await rateLimit("file_build", "u2"); // other users are counted separately
  });

  it("spend is read at most once a minute per team (cheap to check on every request)", async () => {
    await assertBudget("t1");
    // $1.20 of Opus output this month (60,000 tokens at $20 per million), recorded after the first check.
    await db().insert(telemetry).values({ teamId: "t1", kind: "ai", name: "speech_draft:claude-opus-5-5", ms: 1000, ok: true, data: { usage: { inputTokens: 0, outputTokens: 60_000 } } });
    const { monthSpendUsd } = await import("@/server/limits");
    expect(await monthSpendUsd("t1")).toBe(0);
  });

  it("reads the recorded spend (uncached) against the cap", async () => {
    await db().insert(teams).values({ id: "t2", name: "Team 2", createdBy: "u1", aiMonthlyCapUsd: 1 });
    await db().insert(telemetry).values({ teamId: "t2", kind: "ai", name: "web_discover:claude-sonnet-5", ms: 1000, ok: true, data: { usage: { inputTokens: 100_000, outputTokens: 0 }, searches: 90 } });
    await expect(assertBudget("t2")).rejects.toMatchObject({ status: 429 });
  });
});
