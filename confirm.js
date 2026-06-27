// api/confirm.js
// Called by the confirm pixel on destination pages
// Marks a click as "landed" when the user actually arrives at the destination
// Method: GET
// Query: ?cid=<click_uuid>

const { createClient } = require("@supabase/supabase-js");

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

module.exports = async function handler(req, res) {
  // Only GET
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  const { cid } = req.query;

  if (!cid || !isUUID(cid)) {
    // Silent fail — return 204 so the pixel doesn't throw errors on the page
    return res.status(204).end();
  }

  // Update click status to landed
  // Only update rows that are still "initiated" — prevents double-counting
  const { error } = await sb
    .from("clicks")
    .update({
      status:    "landed",
      landed_at: new Date().toISOString(),
    })
    .eq("id", cid)
    .eq("status", "initiated");

  if (error) {
    console.error("Confirm update failed:", error.message);
  }

  // Always return 204 — silent pixel, no content
  return res.status(204).end();
};
