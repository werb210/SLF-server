// SLF_FULL_MODEL_v1 - stage derivation + file-date parsing, against the real QA payload.
import { describe, it, expect } from "vitest";
import { deriveStage, uploadedAtFromUrl, toBool, toNum } from "../src/slf/derive";
describe("deriveStage", () => {
  it("SLF returns no status field, so stage comes from booleans + offers", () => { expect(deriveStage({ offer: [], offered: false, isActive: false, isComplete: false })).toBe("submitted"); });
  it("an accepted offer with the request active is an active facility", () => { expect(deriveStage({ offer: [{ status: "accepted", isActive: true }], isActive: true })).toBe("active"); });
  it("an accepted offer that has ended is ended, not active", () => { expect(deriveStage({ offer: [{ status: "accepted", ended: true }], isActive: true })).toBe("ended"); });
  it("isComplete wins over everything", () => { expect(deriveStage({ offer: [{ status: "accepted" }], isComplete: true })).toBe("complete"); });
  it("a live offer with no acceptance is offered", () => { expect(deriveStage({ offer: [{ status: "pending", isActive: true }], offered: true })).toBe("offered"); });
  it("all offers rejected is declined", () => { expect(deriveStage({ offer: [{ status: "rejected", rejectReason: "too thin" }] })).toBe("declined"); });
  it("an incomplete applicant form is still a draft", () => { expect(deriveStage({ offer: [], sub: { applicantFormCompleted: false } })).toBe("draft"); });
});
describe("uploadedAtFromUrl", () => {
  it("recovers the upload time from the filename, the only time signal SLF gives us", () => { const d = uploadedAtFromUrl("https://x/marketplace/sunvolt_electric/bank_statement/2026-07-06_17-26-51-BanklStatement.pdf"); expect(d?.toISOString()).toBe("2026-07-06T17:26:51.000Z"); });
  it("returns null rather than guessing when there is no date", () => { expect(uploadedAtFromUrl("https://x/nope.pdf")).toBeNull(); });
});
describe("coercion", () => {
  it('isApproved comes back as the STRING "True", not a boolean', () => { expect(toBool("True")).toBe(true); expect(toBool(false)).toBe(false); expect(toBool(null)).toBeNull(); });
  it("does not coerce garbage to 0", () => { expect(toNum("")).toBeNull(); expect(toNum(14000)).toBe(14000); });
});
