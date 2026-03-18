import { describe, expect, it } from "vitest";
import { normalizeStatus } from "../src/statusMap";

describe("normalizeStatus", () => {
  it("returns new for empty input", () => {
    expect(normalizeStatus("")).toBe("new");
  });

  it("maps known statuses case-insensitively", () => {
    expect(normalizeStatus("APPROVED_BY_UNDERWRITER")).toBe("approved");
    expect(normalizeStatus("Declined for docs")).toBe("declined");
    expect(normalizeStatus("Loan Funded")).toBe("funded");
    expect(normalizeStatus("Pending review")).toBe("pending");
    expect(normalizeStatus("manual review queued")).toBe("under_review");
  });

  it("falls back to new when status is unknown", () => {
    expect(normalizeStatus("something_else")).toBe("new");
  });
});
