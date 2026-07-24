import { describe, expect, it } from "vitest";
import {
  extractAmount,
  extractCompanyName,
  extractLender,
  extractTerms,
  REQUEST_FILE_FIELDS,
} from "../src/slf/normalize";

describe("SLF family alignment normalization", () => {
  it("maps invoice/factoring bid fields without requiring the credit request shape", () => {
    const req = {
      id: 11,
      invoices: [{ sub: "SunVolt Electric", amount: "150000" }],
      advanceRate: "90",
      discountRate: "7",
      holdbackPercent: "10",
      fininst: { name: "SLF Capital", logo: "logo.png" },
    };

    expect(extractAmount(req)).toBe(150000);
    expect(extractCompanyName(req)).toBe("SunVolt Electric");
    expect(extractLender(req)).toEqual({
      name: "SLF Capital",
      logo: "logo.png",
    });
    expect(extractTerms(req)).toMatchObject({
      invoiceTotal: 150000,
      invoiceCount: 1,
      advanceRate: 90,
      advanceAmount: 135000,
      discountRate: 7,
      holdbackPercent: 10,
      netAmount: 125550,
    });
  });

  it("collects initial and signed initial file fields", () => {
    expect(REQUEST_FILE_FIELDS).toEqual([
      "files",
      "terms",
      "signedTermsFiles",
      "signedFiles",
      "initialFiles",
      "signedInitialFiles",
      "additionalFiles",
    ]);
  });

  it("keeps existing credit-style top-level amount semantics", () => {
    const req = {
      amount: 42000,
      invoices: [{ amount: 10 }],
      sub: { companyName: "Credit Co" },
    };

    expect(extractAmount(req)).toBe(42000);
    expect(extractCompanyName(req)).toBe("Credit Co");
  });
});
