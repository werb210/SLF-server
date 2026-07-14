// SLF_FULL_MODEL_v1 - persist the ENTIRE SLF request payload, relationally + raw.
import type { PoolClient } from "pg";
import { pool } from "../db/pool";
import { deriveStage, toBool, toNum, uploadedAtFromUrl } from "./derive";

type Json = Record<string, any>;

async function upsertUser(c: PoolClient, u: Json | null | undefined, subId: number | null) {
  if (!u || typeof u.id !== "number") return;
  await c.query(
    `INSERT INTO slf_users (id, email, first_name, last_name, phone_number, role, sub_id, raw, last_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
       phone_number=EXCLUDED.phone_number, role=EXCLUDED.role, sub_id=COALESCE(EXCLUDED.sub_id, slf_users.sub_id), raw=EXCLUDED.raw, last_synced_at=now()`,
    [u.id, u.email ?? null, u.firstName ?? null, u.lastName ?? null, u.phoneNumber ?? null, u.role ?? null, subId, JSON.stringify(u)],
  );
}

async function upsertFiles(c: PoolClient, files: Json[] | null | undefined, ownerKind: string, ownerId: number, requestId: number | null) {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    if (!f || typeof f.id !== "number") continue;
    await c.query(
      `INSERT INTO slf_files (id, owner_kind, owner_id, request_id, file_url, file_type, size_bytes, start_date, end_date, uploaded_at, raw, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (id, owner_kind, owner_id) DO UPDATE SET request_id=EXCLUDED.request_id, file_url=EXCLUDED.file_url, file_type=EXCLUDED.file_type,
         size_bytes=EXCLUDED.size_bytes, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, uploaded_at=EXCLUDED.uploaded_at, raw=EXCLUDED.raw, last_synced_at=now()`,
      [f.id, ownerKind, ownerId, requestId, f.file ?? null, f.fileType ?? null, toNum(f.size), f.startDate ?? null, f.endDate ?? null, uploadedAtFromUrl(f.file), JSON.stringify(f)],
    );
  }
}

async function upsertSub(c: PoolClient, sub: Json | null | undefined): Promise<number | null> {
  if (!sub || typeof sub.id !== "number") return null;
  const subId: number = sub.id;
  await upsertUser(c, sub.admin, subId); await upsertUser(c, sub.applicant, subId);
  if (Array.isArray(sub.users)) for (const u of sub.users) await upsertUser(c, u, subId);
  await c.query(
    `INSERT INTO slf_subs (id, company_name, gst, employee_count, address, city, province, postal_code, country, website, sub_trade, is_union, sub_contracting, ed_sub, is_approved, partnership, notes, business_bankruptcy, personal_bankruptcy, company_start, admin_user_id, applicant_user_id, applicant_job_title, applicant_ownership_percent, applicant_invited, applicant_form_completed, requested_documents, required_documents, slf_updated_at, raw, last_synced_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30, now())
     ON CONFLICT (id) DO UPDATE SET company_name=EXCLUDED.company_name, gst=EXCLUDED.gst, employee_count=EXCLUDED.employee_count, address=EXCLUDED.address, city=EXCLUDED.city, province=EXCLUDED.province, postal_code=EXCLUDED.postal_code, country=EXCLUDED.country, website=EXCLUDED.website, sub_trade=EXCLUDED.sub_trade, is_union=EXCLUDED.is_union, sub_contracting=EXCLUDED.sub_contracting, ed_sub=EXCLUDED.ed_sub, is_approved=EXCLUDED.is_approved, partnership=EXCLUDED.partnership, notes=EXCLUDED.notes, business_bankruptcy=EXCLUDED.business_bankruptcy, personal_bankruptcy=EXCLUDED.personal_bankruptcy, company_start=EXCLUDED.company_start, admin_user_id=EXCLUDED.admin_user_id, applicant_user_id=EXCLUDED.applicant_user_id, applicant_job_title=EXCLUDED.applicant_job_title, applicant_ownership_percent=EXCLUDED.applicant_ownership_percent, applicant_invited=EXCLUDED.applicant_invited, applicant_form_completed=EXCLUDED.applicant_form_completed, requested_documents=EXCLUDED.requested_documents, required_documents=EXCLUDED.required_documents, slf_updated_at=EXCLUDED.slf_updated_at, raw=EXCLUDED.raw, last_synced_at=now()`,
    [subId, sub.companyName ?? null, sub.gst ?? null, toNum(sub.employeeCount), sub.address ?? null, sub.city ?? null, sub.province ?? null, sub.postalCode ?? null, sub.country ?? null, sub.website ?? null, Array.isArray(sub.subTrade) ? sub.subTrade.map(String) : null, toBool(sub.union), toBool(sub.subContracting), toBool(sub.edSub), toBool(sub.isApproved), sub.partnership ?? null, sub.notes ?? null, toBool(sub.businessBankruptcy), toBool(sub.personalBankruptcy), sub.companyStart ?? null, sub.admin?.id ?? null, sub.applicant?.id ?? null, sub.applicantJobTitle ?? null, toNum(sub.applicantOwnershipPercent), sub.applicantInvited ?? null, toBool(sub.applicantFormCompleted), JSON.stringify(sub.requestedDocuments ?? []), JSON.stringify(sub.requiredDocuments ?? []), sub.updatedAt ?? null, JSON.stringify(sub)],
  );
  await upsertFiles(c, sub.files, "sub", subId, null); return subId;
}

export async function ingestRequest(family: string, req: Json): Promise<void> {
  if (!req || typeof req.id !== "number") return; const requestId: number = req.id; const c = await pool.connect();
  try { await c.query("BEGIN"); const subId = await upsertSub(c, req.sub); const stage = deriveStage(req);
    await c.query(`INSERT INTO slf_requests (id, product_family, sub_id, amount, notes, country, is_active, is_complete, hidden, offered, ongoing_loc_count, ongoing_loc_total, equipment_finance_request, stage, raw, last_synced_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, now()) ON CONFLICT (id) DO UPDATE SET product_family=EXCLUDED.product_family, sub_id=EXCLUDED.sub_id, amount=EXCLUDED.amount, notes=EXCLUDED.notes, country=EXCLUDED.country, is_active=EXCLUDED.is_active, is_complete=EXCLUDED.is_complete, hidden=EXCLUDED.hidden, offered=EXCLUDED.offered, ongoing_loc_count=EXCLUDED.ongoing_loc_count, ongoing_loc_total=EXCLUDED.ongoing_loc_total, equipment_finance_request=EXCLUDED.equipment_finance_request, stage=EXCLUDED.stage, raw=EXCLUDED.raw, last_synced_at=now()`, [requestId, family, subId, toNum(req.amount), req.notes ?? null, req.country ?? null, toBool(req.isActive), toBool(req.isComplete), toBool(req.hidden), toBool(req.offered), toNum(req.ongoingLoc?.count), toNum(req.ongoingLoc?.total), req.equipmentFinanceRequest ? JSON.stringify(req.equipmentFinanceRequest) : null, stage, JSON.stringify(req)]);
    for (const k of Array.isArray(req.contracts) ? req.contracts : []) { if (!k || typeof k.id !== "number") continue; await c.query(`INSERT INTO slf_contracts (id, request_id, sub_id, contract_number, amount, general_contractor, holdback_percent, notes, country, is_verified, change_orders, raw, last_synced_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now()) ON CONFLICT (id) DO UPDATE SET request_id=EXCLUDED.request_id, sub_id=EXCLUDED.sub_id, contract_number=EXCLUDED.contract_number, amount=EXCLUDED.amount, general_contractor=EXCLUDED.general_contractor, holdback_percent=EXCLUDED.holdback_percent, notes=EXCLUDED.notes, country=EXCLUDED.country, is_verified=EXCLUDED.is_verified, change_orders=EXCLUDED.change_orders, raw=EXCLUDED.raw, last_synced_at=now()`, [k.id, requestId, toNum(k.sub), k.contractNumber ?? null, toNum(k.amount), k.generalContractor ?? null, toNum(k.holdbackPercent), k.notes ?? null, k.country ?? null, toBool(k.isVerified), JSON.stringify(k.changeOrders ?? []), JSON.stringify(k)]); await upsertFiles(c, k.files, "contract", k.id, requestId); }
    for (const o of Array.isArray(req.offer) ? req.offer : []) { if (!o || typeof o.id !== "number") continue; await c.query(`INSERT INTO slf_offers (id, request_id, amount, status, reject_reason, notes, original_interest_rate, interest_rate_type, lender_id, lender_name, lender_logo, ended, end_date, is_active, slf_created_at, raw, last_synced_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now()) ON CONFLICT (id) DO UPDATE SET request_id=EXCLUDED.request_id, amount=EXCLUDED.amount, status=EXCLUDED.status, reject_reason=EXCLUDED.reject_reason, notes=EXCLUDED.notes, original_interest_rate=EXCLUDED.original_interest_rate, interest_rate_type=EXCLUDED.interest_rate_type, lender_id=EXCLUDED.lender_id, lender_name=EXCLUDED.lender_name, lender_logo=EXCLUDED.lender_logo, ended=EXCLUDED.ended, end_date=EXCLUDED.end_date, is_active=EXCLUDED.is_active, slf_created_at=EXCLUDED.slf_created_at, raw=EXCLUDED.raw, last_synced_at=now()`, [o.id, requestId, toNum(o.amount), o.status ?? null, o.rejectReason ?? null, o.notes ?? null, toNum(o.originalInterestRate), o.interestRateType ?? null, o.fininst?.id ?? null, o.fininst?.name ?? null, o.fininst?.logo ?? null, toBool(o.ended), o.endDate ?? null, toBool(o.isActive), o.createdAt ?? null, JSON.stringify(o)]); await upsertFiles(c, o.terms, "offer_terms", o.id, requestId); await upsertFiles(c, o.signedTermsFiles, "offer_signed_terms", o.id, requestId); await upsertFiles(c, o.files, "offer_file", o.id, requestId); await upsertFiles(c, o.signedFiles, "offer_signed_file", o.id, requestId); await upsertFiles(c, o.additionalFiles, "offer_additional", o.id, requestId); }
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}
