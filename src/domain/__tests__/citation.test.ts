import { describe, expect, it } from "vitest";
import { organizationInitials, shortCite } from "../citation";

describe("shortCite without a named author", () => {
  it("uses the organization, else the publication, else says so", async () => {
    const { shortCite } = await import("../citation");
    expect(shortCite({ authors: [], organization: "Congressional Budget Office", organizationShort: "CBO", date: { year: 2022 }, provenance: {} })).toBe("CBO 22");
    expect(shortCite({ authors: [], publication: "The Commonwealth Fund", date: { year: 2026 }, provenance: {} })).toBe("Commonwealth Fund 26");
    expect(shortCite({ authors: [], provenance: {} })).toBe("Unknown author ND");
  });
});

describe("short cites for listed et al. names and organizations", () => {
  const base = { provenance: {}, date: { year: 2025 } };
  it("one listed name ending in et al. keeps the family name", () => {
    expect(shortCite({ ...base, authors: [{ name: "Christopher Cai et al." }] })).toBe("Cai et al. 25");
  });
  it("uses an organization's initials only when its web address confirms them", () => {
    expect(shortCite({ ...base, authors: [], organization: "Committee for a Responsible Federal Budget", url: "https://www.crfb.org/papers/x" })).toBe("CRFB 25");
    expect(shortCite({ ...base, authors: [], organization: "Centers for Medicare & Medicaid Services", url: "https://www.cms.gov/x" })).toBe("Centers for Medicare & Medicaid Services 25");
    expect(organizationInitials("Congressional Budget Office")).toBeNull();
  });
});
