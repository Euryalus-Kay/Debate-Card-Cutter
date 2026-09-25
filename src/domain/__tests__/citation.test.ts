import { describe, expect, it } from "vitest";

describe("shortCite without a named author", () => {
  it("uses the organization, else the publication, else says so", async () => {
    const { shortCite } = await import("../citation");
    expect(shortCite({ authors: [], organization: "Congressional Budget Office", organizationShort: "CBO", date: { year: 2022 }, provenance: {} })).toBe("CBO 22");
    expect(shortCite({ authors: [], publication: "The Commonwealth Fund", date: { year: 2026 }, provenance: {} })).toBe("Commonwealth Fund 26");
    expect(shortCite({ authors: [], provenance: {} })).toBe("Unknown author ND");
  });
});
