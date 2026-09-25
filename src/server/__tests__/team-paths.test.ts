import { describe, expect, it } from "vitest";
import { isTeamIncomingPath } from "@/server/uploads";

describe("isTeamIncomingPath", () => {
  it("accepts the team's own upload folder", () => {
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/1NC_Politics-Ab12Cd.docx")).toBe(true);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/a..b.docx")).toBe(true);
  });
  it("refuses other teams and paths that resolve elsewhere once they become URLs", () => {
    expect(isTeamIncomingPath("tm_a", "teams/tm_b/incoming/x.docx")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/../../tm_b/incoming/x.docx")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/./x.docx")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/%2e%2e/x.docx")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming//x.docx")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/..\\x.docx")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_a/incoming/x.docx?y=1")).toBe(false);
    expect(isTeamIncomingPath("tm_a", "teams/tm_ab/incoming/x.docx")).toBe(false);
  });
});
