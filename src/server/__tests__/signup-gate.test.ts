import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "../../../tests/helpers/pglite";

let close: () => Promise<void>;

beforeAll(async () => {
  process.env.SIGNUP_MODE = "invite";
  process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret-123";
  ({ close } = await freshDb());
});

afterAll(async () => {
  delete process.env.SIGNUP_MODE;
  await close();
});

const body = (n: number) => ({ name: `Person ${n}`, email: `p${n}@example.test`, password: "long-enough-password" });

describe("invite-only signup", () => {
  it("lets the first account in, then requires a valid team invite", async () => {
    const { auth } = await import("@/server/auth");
    const { createTeam, createInvite } = await import("@/server/teams");

    const owner = await auth().api.signUpEmail({ body: body(1) });
    expect(owner.user.email).toBe("p1@example.test");

    await expect(auth().api.signUpEmail({ body: body(2) })).rejects.toThrow(/invite-only/);
    await expect(auth().api.signUpEmail({ body: body(2), headers: new Headers({ "x-invite-token": "not-a-real-token" }) })).rejects.toThrow(/invite-only/);

    const teamId = await createTeam(owner.user.id, owner.user.name, "Test Team");
    const { token } = await createInvite(teamId, owner.user.id);
    const partner = await auth().api.signUpEmail({ body: body(2), headers: new Headers({ "x-invite-token": token }) });
    expect(partner.user.email).toBe("p2@example.test");
  });
});
