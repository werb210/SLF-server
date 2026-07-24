import { toNum } from "./derive";

type Json = Record<string, any>;

export const REQUEST_FILE_FIELDS = [
  "files",
  "terms",
  "signedTermsFiles",
  "signedFiles",
  "initialFiles",
  "signedInitialFiles",
  "additionalFiles",
] as const;

function first<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function firstNum(...values: unknown[]): number | null {
  for (const value of values) {
    const n = toNum(value);
    if (n !== null) return n;
  }
  return null;
}

function invoiceArray(req: Json): Json[] {
  return Array.isArray(req.invoices)
    ? req.invoices.filter((i) => i && typeof i === "object")
    : [];
}

function invoiceTotal(req: Json): number | null {
  const direct = firstNum(
    req.invoiceTotal,
    req.invoice_total,
    req.totalInvoiceAmount,
    req.totalInvoiceValue,
  );
  if (direct !== null) return direct;
  const invoices = invoiceArray(req);
  if (!invoices.length) return null;
  const total = invoices.reduce(
    (sum, inv) =>
      sum +
      (firstNum(
        inv.amount,
        inv.total,
        inv.invoiceAmount,
        inv.faceValue,
        inv.value,
      ) ?? 0),
    0,
  );
  return total > 0 ? total : null;
}

export function extractAmount(req: Json): number | null {
  return firstNum(
    req.amount,
    invoiceTotal(req),
    req.requestedAmount,
    req.loanAmount,
    req.equipmentFinanceRequest?.amount,
    req.contracts?.[0]?.amount,
    req.offer?.[0]?.amount,
  );
}

export function extractCompanyName(req: Json): string | null {
  return first<string>(
    typeof req.sub === "string" ? req.sub : req.sub?.companyName,
    req.companyName,
    req.company_name,
    typeof req.invoices?.[0]?.sub === "string"
      ? req.invoices[0].sub
      : req.invoices?.[0]?.sub?.companyName,
    req.invoices?.[0]?.companyName,
    req.invoices?.[0]?.company,
    req.invoices?.[0]?.customerName,
    req.invoices?.[0]?.debtorName,
  );
}

export function extractCountry(req: Json): string | null {
  return first<string>(
    req.country,
    req.sub?.country,
    req.invoices?.[0]?.country,
    req.contracts?.[0]?.country,
  );
}

export function extractExternalStatus(req: Json): string | null {
  return first<string>(
    req.status,
    req.externalStatus,
    req.state,
    req.offer?.[0]?.status,
  );
}

export function extractLender(req: Json): {
  name: string | null;
  logo: string | null;
} {
  return {
    name: first<string>(
      req.fininst?.name,
      req.finInst?.name,
      req.financialInstitution?.name,
      req.offer?.[0]?.fininst?.name,
    ),
    logo: first<string>(
      req.fininst?.logo,
      req.finInst?.logo,
      req.financialInstitution?.logo,
      req.offer?.[0]?.fininst?.logo,
    ),
  };
}

export function extractTerms(req: Json) {
  const total = invoiceTotal(req);
  const advanceRate = firstNum(
    req.advanceRate,
    req.advance_rate,
    req.terms?.advanceRate,
  );
  const advanceAmount = firstNum(
    req.advanceAmount,
    req.advance_amount,
    advanceRate !== null && total !== null ? (total * advanceRate) / 100 : null,
  );
  const discountRate = firstNum(
    req.discountRate,
    req.discount_rate,
    req.terms?.discountRate,
  );
  const holdbackPercent = firstNum(
    req.holdbackPercent,
    req.holdback_percent,
    req.terms?.holdbackPercent,
  );
  const netAmount = firstNum(
    req.netAmount,
    req.net_amount,
    advanceAmount !== null && discountRate !== null
      ? Math.round(advanceAmount * (1 - discountRate / 100) * 100) / 100
      : null,
  );
  return {
    invoiceTotal: total,
    invoiceCount:
      invoiceArray(req).length || firstNum(req.invoiceCount, req.invoice_count),
    advanceRate,
    advanceAmount,
    discountRate,
    holdbackPercent,
    netAmount,
  };
}
