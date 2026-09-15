import { describe, expect, it } from "vitest";
import { dealIdToKey, KEY_BASE, requestKey } from "../requestKey";
describe("family-encoded request keys", () => {
  it("separates identical ids by family", () => {
    expect(requestKey("invoice", 1)).not.toBe(requestKey("credit", 1));
    expect(requestKey("credit", 1)).toBe(KEY_BASE + 1);
  });
  it("validates and parses ids", () => {
    expect(dealIdToKey("invoice-1")).toBe(requestKey("invoice", 1));
    expect(dealIdToKey("equipment-financing-7")).toBe(
      requestKey("equipment-financing", 7),
    );
    expect(dealIdToKey(String(KEY_BASE + 1))).toBe(KEY_BASE + 1);
    expect(dealIdToKey("mortgage-1")).toBeNull();
    expect(() => requestKey("credit", KEY_BASE)).toThrow();
  });
});
