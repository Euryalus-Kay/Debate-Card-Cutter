// @vitest-environment node
/**
 * One shared library for the whole site: when a team is marked as the site's shared team, every account joins
 * it (on sign-in, on first use of its data, or instead of making its own team). Other teams stay private.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../tests/helpers/pglite";
import { db } from "@/server/db/client";
import { teamMembers, teams, user } from "@/server/db/schema";
import { createTeam, forgetSiteTeam, joinSiteTeam, teamsForUser } from "@/server/teams";
import { requireTeam } from "@/server/authz";

let close: () => Promise<void>;
beforeAll(async () => {
  ({ close } = await freshDb());
  for (const [id, name] of [["u1", "Owner One"], ["u2", "Partner Two"], ["u3", "Third Person"], ["u4", "Fourth Person"], ["u5", "Private Five"]]) await db().insert(user).values({ id, name, email: `${id}@example.test` });
  await db().insert(teams).values({ id: "t_site", name: "Site team", createdBy: "u1", siteShared: true });
  await db().insert(teamMembers).values({ teamId: "t_site", userId: "u1", role: "owner", initials: "OO" });
  await db().insert(teams).values({ id: "t_private", name: "Other", createdBy: "u5" });
  await db().insert(teamMembers).values({ teamId: "t_private", userId: "u5", role: "owner", initials: "PF" });
  forgetSiteTeam();
});
afterAll(async () => close());

describe("the site's shared team", () => {
  it("an account joins it as a member; the owner stays owner", async () => {
    expect(await joinSiteTeam("u2", "Partner Two")).toBe("t_site");
    expect((await teamsForUser("u2")).map((t) => [t.id, t.role])).toEqual([["t_site", "member"]]);
    await joinSiteTeam("u1", "Owner One");
    expect((await teamsForUser("u1")).map((t) => t.role)).toEqual(["owner"]);
  });

  it("making a team joins the shared one instead of starting a second library", async () => {
    expect(await createTeam("u3", "Third Person", "My own team")).toBe("t_site");
    expect(await db().select().from(teams)).toHaveLength(2);
  });

  it("an account that hasn't joined yet gets in on first use; a private team stays closed", async () => {
    await expect(requireTeam("u4", "t_site")).resolves.toMatchObject({ role: "member" });
    await expect(requireTeam("u4", "t_private")).rejects.toMatchObject({ status: 404 });
    expect((await db().select().from(teamMembers).where(eq(teamMembers.teamId, "t_private"))).map((m) => m.userId)).toEqual(["u5"]);
  });
});
