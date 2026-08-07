/* ============================================================
   CONFIG — the only file you need to edit to go live.
   ------------------------------------------------------------
   Leave these blank and the dashboard runs in LOCAL mode:
   it works fully, but changes are saved only in this browser.

   Fill them in and it switches to CLOUD mode: every change is
   saved to your Supabase database and everyone sharing the link
   sees the same numbers.

   Where to find these two values:
     Supabase dashboard → your project → Settings → API Keys
       • Project URL         → SUPABASE_URL
       • Publishable key     → SUPABASE_ANON_KEY
         (starts "sb_publishable_...")

   Supabase renamed these keys in 2025. If your project still
   shows a Legacy tab with an "anon public" key starting "eyJ...",
   that works here too — same position, same behaviour — but the
   legacy keys are being retired at the end of 2026, so prefer the
   publishable one. The setting name below stays SUPABASE_ANON_KEY
   either way.

   Both are designed to be public and safe to ship in a browser
   app. What must NEVER go in this file is the secret key
   ("sb_secret_...", formerly service_role) — that one bypasses
   every security rule on your database.
   ============================================================ */

window.TH_CONFIG = {
  SUPABASE_URL:      'sb_publishable_sl-6TJdp_ZExo8N93AFF-Q_7cX27eZO',
  SUPABASE_ANON_KEY: 'sb_publishable_sl-6TJdp_ZExo8N93AFF-Q_7cX27eZO',

  // Table name created by supabase/schema.sql
  TABLE: 'transactions',

  // Default commission rate used to auto-fill gross commission
  // when you leave that field blank on a new sale (2.5%).
  DEFAULT_COMMISSION_RATE: 0.025,

  // Shown under the page title.
  SUBTITLE: 'San Francisco · Compass · Sherri Howe, CA DRE# 01816621'
};
