import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";

// This is a no-payment continuity intake, deliberately isolated from production Auth.
// Public endpoint; only the service-role server writes to a private RLS table.
const ORIGINS = new Set([
  "https://cleaning.direct",
  "https://www.cleaning.direct",
  "https://lou4yo.github.io",
]);
const PRICING_VERSION = "surrey_standard_intro_2026_10_26";
const CONSENT_VERSION = "quote_contact_ai_or_human_2026_10_26";

function response(req: Request, status: number, data: Record<string, unknown>) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string,string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, apikey, authorization, x-client-info",
    "vary": "Origin",
  };
  if (ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(data), { status, headers });
}
const string = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length <= max ? v.trim() : "";
const integer = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) ? v : NaN;

export function pricing(property: string, bedrooms: number, bathrooms: number, frequency: string) {
  const quarterHours = 8 + bedrooms * 2 + (bathrooms - 1) * 2 + (property === "house" ? 2 : 0);
  const discount = frequency === "weekly" ? 5 : frequency === "fortnightly" ? 3 : 0;
  const totalPence = Math.round(2600 * quarterHours / 4 * (100 - discount) / 100);
  return { quarterHours, totalPence };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ORIGINS.has(origin)) return response(req, 403, { ok:false, error:"origin_not_allowed" });
  if (req.method === "OPTIONS") return new Response(null, { status:204, headers: response(req,200,{}).headers });
  if (req.method === "GET") return response(req,200,{ ok:true, service:"quote_recovery", payments:false, bookings:false });
  if (req.method !== "POST") return response(req,405,{ ok:false, error:"method_not_allowed" });
  if (!origin || !ORIGINS.has(origin)) return response(req,403,{ ok:false, error:"browser_origin_required" });
  if (!(req.headers.get("content-type")||"").toLowerCase().startsWith("application/json")) {
    return response(req,415,{ ok:false, error:"json_required" });
  }
  const declared = Number(req.headers.get("content-length")||"0");
  if (declared > 4096) return response(req,413,{ ok:false, error:"too_large" });
  let body: Record<string,unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 4096) return response(req,413,{ ok:false, error:"too_large" });
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("shape");
    body = parsed;
  } catch { return response(req,400,{ok:false,error:"bad_json"}); }

  // Honeypot: ignored fake confirmation for automated bulk submissions.
  if (body.website) return response(req,202,{ok:true,status:"received"});
  const first = string(body.firstName,80);
  const email = string(body.email,254).toLowerCase();
  const phone = string(body.phone ?? "",24);
  const postcode = string(body.postcode,10).replace(/\s+/g," ").toUpperCase();
  const property = string(body.propertyType,10);
  const bedrooms = integer(body.bedrooms);
  const bathrooms = integer(body.bathrooms);
  const frequency = string(body.frequency,16);
  const idempotencyKey = string(body.idempotencyKey,80);
  const source = string(body.utmSource || "direct",40).toLowerCase().replace(/[^a-z0-9_-]/g,"") || "direct";
  const medium = string(body.utmMedium || "none",40).toLowerCase().replace(/[^a-z0-9_-]/g,"") || "none";
  const campaign = string(body.utmCampaign || "none",80).toLowerCase().replace(/[^a-z0-9_-]/g,"") || "none";
  const emailOk = /^[^\s@]{1,64}@[^\s@]{1,185}\.[A-Za-z]{2,}$/.test(email);
  const phoneOk = !phone || /^[\d ()+\-]{7,24}$/.test(phone);
  const postcodeOk = /^(GIR ?0AA|[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})$/.test(postcode);
  if (!first || !emailOk || !phoneOk || !postcodeOk ||
      !["flat","house"].includes(property) ||
      !Number.isInteger(bedrooms) || bedrooms < 1 || bedrooms > 6 ||
      !Number.isInteger(bathrooms) || bathrooms < 1 || bathrooms > 4 ||
      !["weekly","fortnightly","monthly","one_off"].includes(frequency) ||
      !/^[a-zA-Z0-9:_-]{12,80}$/.test(idempotencyKey) ||
      body.contactConsent !== true || typeof body.marketingConsent !== "boolean" ||
      body.service !== "standard") {
    return response(req,400,{ok:false,error:"invalid_details_or_consent"});
  }
  const {quarterHours,totalPence} = pricing(property,bedrooms,bathrooms,frequency);
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return response(req,503,{ok:false,error:"temporarily_unavailable"});
  const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  // No raw IP stored: HMAC is keyed with the existing server-only secret.
  // Global 120/hour and per-source 5/hour limits fail closed if the RPC fails.
  const ip = (req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
    "unavailable").trim().slice(0,80);
  const encoder = new TextEncoder();
  const macKey = await crypto.subtle.importKey("raw",encoder.encode(key),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature = await crypto.subtle.sign("HMAC",macKey,encoder.encode(ip));
  const fingerprint = [...new Uint8Array(signature)]
    .map(v=>v.toString(16).padStart(2,"0")).join("");
  const { data:slot, error:rateError } = await db.rpc("claim_customer_quote_recovery_slot",
    {p_fingerprint:fingerprint});
  if (rateError) {
    console.error("quote_recovery_limit_failed",String(rateError.code||"unknown"));
    return response(req,503,{ok:false,error:"temporarily_unavailable"});
  }
  if (slot !== true) return response(req,429,{ok:false,error:"try_again_later"});
  const {data,error} = await db.from("customer_quote_recovery_queue").insert({
    idempotency_key:idempotencyKey,
    first_name:first,email,phone,postcode,
    property_type:property,bedrooms,bathrooms,frequency,service:"standard",
    planned_quarter_hours:quarterHours,
    estimated_total_pence:totalPence,
    pricing_version:PRICING_VERSION,consent_version:CONSENT_VERSION,
    contact_consent:true,marketing_consent:body.marketingConsent,
    attribution_source:source, attribution_medium:medium, attribution_campaign:campaign,status:"pending_main_sync",
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return response(req,202,{ok:true,status:"already_received",pricePence:totalPence});
    console.error("quote_recovery_insert_failed", String(error.code||"unknown"));
    return response(req,503,{ok:false,error:"save_unavailable"});
  }
  if (!data?.id) return response(req,503,{ok:false,error:"save_unconfirmed"});
  return response(req,202,{
    ok:true,status:"received",reference:data.id,pricePence:totalPence,
    message:"Your free estimate enquiry is saved. No clean is booked, and no payment is taken. We will contact you when suitable independently verified cleaner availability is established.",
  });
});
