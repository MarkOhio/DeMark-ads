// api/click.js
// Receives click events from ad.js, inserts a click row, returns redirect URL
// Method: POST
// Body: { ad_id: string, site_id: string, destination_url: string }

const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Allowed origins — add every domain that runs ad.js
const ALLOWED_ORIGINS = [
  "https://demarktv.com",
  "https://markohio.github.io/",
  "https://www.demarktv.com",
  "https://markohio.github.io/Ad-test-site/",
  // add more here
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin":  allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
}

// Basic UUID check
function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// Basic URL check — must be http or https
function isSafeURL(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = corsHeaders(origin);

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(204).set(headers).end();
  }

  if (req.method !== "POST") {
    return res.status(405).set(headers).json({ error: "Method not allowed" });
  }

  const { ad_id, site_id, destination_url } = req.body || {};

  // Validate inputs
  if (!ad_id || !isUUID(ad_id)) {
    return res.status(400).set(headers).json({ error: "Invalid ad_id" });
  }

  if (!site_id || typeof site_id !== "string" || site_id.length > 253) {
    return res.status(400).set(headers).json({ error: "Invalid site_id" });
  }

  if (!destination_url || !isSafeURL(destination_url)) {
    return res.status(400).set(headers).json({ error: "Invalid destination_url" });
  }

  // Confirm ad exists and is active
  const { data: ad, error: adErr } = await sb
    .from("ads")
    .select("id, click_url")
    .eq("id", ad_id)
    .eq("active", true)
    .single();

  if (adErr || !ad) {
    return res.status(404).set(headers).json({ error: "Ad not found or inactive" });
  }

  // Use the click_url stored in the DB — never trust the frontend's destination_url
  // The frontend value is only used as a fallback label; the DB value is authoritative
  const safeRedirect = ad.click_url;

  // Insert click row
  const { data: click, error: insertErr } = await sb
    .from("clicks")
    .insert({
      ad_id:   ad.id,
      site_id: site_id.trim(),
      status:  "initiated",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("Click insert failed:", insertErr.message);
    // Still redirect — don't break the ad experience over a DB error
    return res.status(200).set(headers).json({ redirect_url: safeRedirect });
  }

  // Build redirect URL with click ID appended as ?cid= for the confirm pixel
  const redirectUrl = safeRedirect.includes("?")
    ? `${safeRedirect}&cid=${click.id}`
    : `${safeRedirect}?cid=${click.id}`;

  return res.status(200).set(headers).json({ redirect_url: redirectUrl });
};
