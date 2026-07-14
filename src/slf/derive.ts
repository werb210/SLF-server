// SLF_FULL_MODEL_v1
export type SlfStage = "draft" | "submitted" | "offered" | "accepted" | "active" | "complete" | "declined" | "ended";
type OfferLike = { status?: string | null; rejectReason?: string | null; signedTermsFiles?: unknown[] | null; ended?: boolean | null; isActive?: boolean | null };
type RequestLike = { offer?: OfferLike[] | null; offered?: boolean | null; isActive?: boolean | null; isComplete?: boolean | null; hidden?: boolean | null; sub?: { applicantFormCompleted?: boolean | null } | null };
export function deriveStage(r: RequestLike): SlfStage {
  const offers = Array.isArray(r.offer) ? r.offer : [];
  const live = offers.filter((o) => o && o.isActive !== false);
  const accepted = offers.find((o) => String(o?.status ?? "").toLowerCase() === "accepted");
  const rejected = offers.filter((o) => { const s = String(o?.status ?? "").toLowerCase(); return s === "rejected" || s === "declined" || Boolean(o?.rejectReason); });
  if (r.isComplete === true) return "complete";
  if (accepted) { if (accepted.ended === true) return "ended"; if (r.isActive === true) return "active"; return "accepted"; }
  if (rejected.length > 0 && rejected.length === offers.length && offers.length > 0) return "declined";
  if (live.length > 0 || r.offered === true) return "offered";
  if (r.sub?.applicantFormCompleted === false) return "draft";
  return "submitted";
}
export function uploadedAtFromUrl(url: unknown): Date | null {
  if (typeof url !== "string") return null; const m = url.match(/\/(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})-/);
  if (!m) return null; const d = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`); return Number.isNaN(d.getTime()) ? null : d;
}
export function toBool(v: unknown): boolean | null { if (typeof v === "boolean") return v; if (typeof v === "string") { const s = v.trim().toLowerCase(); if (s === "true") return true; if (s === "false") return false; } return null; }
export function toNum(v: unknown): number | null { if (typeof v === "number" && Number.isFinite(v)) return v; if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v); return null; }
