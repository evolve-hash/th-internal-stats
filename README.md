# Team Howe — Commission Dashboard

A private web dashboard for Team Howe's commission and production history
(2008–present), built to replace scrolling through `Commission_tracker1.xlsx`.

You can **add, edit, and delete sales directly in the browser** — no spreadsheet
required. Every chart and KPI recalculates instantly.

- Brand: real teamhowe.com logo (light + dark lockups), Montserrat, black and
  brand blue `#6787b8` only.
- Light and dark mode, remembered per device.
- Sortable, searchable, filterable, paginated transaction table.
- Source-of-business and property-type mix, filterable by buyer vs. seller side.
- CSV export of whatever is currently filtered.
- Works on desktop, tablet, and phone.

---

## Two ways it can run

| Mode | What happens | When you want it |
|---|---|---|
| **This device** (default) | Loads the 521 historical sales, saves your edits in that browser only | Trying it out |
| **Live** | Reads and writes a shared Supabase database | Real use, so you and Sherri see the same numbers |

In Live mode, reading needs nothing and writing needs a signed-in account. In
"This device" mode there is nothing to protect — the data never leaves your
browser — so no sign-in is asked for.

Open `index.html` and it just works in "This device" mode. The steps below
switch it to Live.

---

## Fastest route

```bash
cd path/to/teamhowe-dashboard
bash deploy.sh
```

Handles GitHub end to end: installs `gh` if missing, signs you in via browser,
creates the repo, pushes, enables Pages, optionally writes your Supabase keys
into `config.js`, and prints the live URL. Idempotent — re-run it any time.

You still create the Supabase *project* in the browser (steps 1 below); there's
no way around that.

---

## Setup — about 15 minutes, no coding

### 1. Create the database (5 min)

1. Go to **supabase.com** → **Start your project** → sign in with GitHub.
2. **New project.** Name it `team-howe`. Pick a strong database password and
   save it in your password manager. Region: **West US (North California)**.
3. Wait ~2 minutes for it to spin up.
4. Left sidebar → **SQL Editor** → **New query**.
5. Open `supabase/schema.sql` from this project, copy the whole file, paste it
   in, press **Run**. You should see "Success".

Supabase's free tier covers this comfortably — 521 rows is nothing. There is no
credit card required, and no charge unless you deliberately upgrade.

> ⚠️ **Please read the security note in the middle of `schema.sql` before this
> holds live numbers.** With no password, anyone who finds the link can not just
> read but also *edit* the commission data. The file explains the fix.

### 2. Point the app at it (2 min)

1. The two values live on **different pages**:
   - **Project URL** → Settings → **Data API**, or the **Connect** button.
     (Equivalently: `https://<the-id-in-your-address-bar>.supabase.co`.)
   - **Publishable key** → Settings → **API Keys**.
2. Copy the **Project URL** and the **publishable key** (`sb_publishable_...`).
   They are different strings — the API Keys page has no URL on it.
   - If your project shows a **Legacy keys** tab with an `anon` `public` key
     starting `eyJ...`, that works identically — but the legacy keys retire at
     the end of 2026, so prefer the publishable one.
   - Either is meant to live in a browser — that part is fine.
   - **Never** copy the **secret key** (`sb_secret_...`, formerly
     `service_role`) into this project. It bypasses every security rule.
3. Open `js/config.js` and paste them in:

```js
window.TH_CONFIG = {
  SUPABASE_URL:      'https://abcdefghijkl.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxx',
  ...
};
```

Open `index.html` again. The badge in the header should read **Live**, and on
first load it fills the database with all 521 historical sales automatically.

### 3. Publish it on GitHub Pages (8 min)

1. Create a GitHub account if you don't have one, then **New repository**.
   Name it something non-obvious (not "team-howe-commissions") — see the
   security note. Set it to **Public** (free Pages only serves public repos).
2. On the empty repo page click **uploading an existing file**, then drag in
   **everything inside this folder** — `index.html`, `css/`, `js/`, `assets/`,
   `supabase/`, `README.md`. Commit.
3. Repo → **Settings** → **Pages**.
4. Under *Build and deployment* → *Source*, choose **Deploy from a branch**;
   Branch = **main**, folder = **/ (root)**. **Save**.
5. Wait ~1 minute, then reload that page — GitHub shows your URL, something like
   `https://yourname.github.io/your-repo-name/`.

Send that link to Sherri. Done.

**To use your own address** (e.g. `stats.teamhowe.com`): add a `CNAME` record at
your DNS provider pointing to `yourname.github.io`, then enter the domain in
Settings → Pages → Custom domain. Note that teamhowe.com itself is managed by
Luxury Presence, so check with them before changing DNS.

---

## Using it day to day

**Add a sale** — *Add Sale* button, top right. Date, client, and sale price are
required; everything else is optional. Leave *Gross commission* blank and it
auto-fills at 2.5% of the sale price (change that default in `js/config.js`).

**Edit or delete** — hover a row in the table; the pencil and trash icons appear
on the right.

**Find something** — search matches client, address, city, referrer, and source.
The year / side / source dropdowns stack on top of the search.

**Export** — *Export CSV* downloads exactly what's on screen after filtering.

**Break the mix down by side** — the *All · Buyer · Seller* control in the
"Where business comes from" header re-cuts both the source-of-business and the
property-type charts for that side only. You can also tap either half of the
buyer/seller bar to filter, and tap it again to clear. It scopes that section
only — the KPIs, the trend charts and the table are unaffected.

**Sign in** — the padlock button in the header. Reading is open to anyone with
the link; adding, editing and removing sales requires an account. When signed
in the header shows your email and a *Sign out* link, and the *Add Sale* button
and the per-row pencil/trash icons appear. When signed out they are simply not
there.

Accounts are created by hand in Supabase (Authentication → Users → Add user,
with **Auto Confirm User** ticked). There is no self-registration, on purpose.

**Dark mode** — the moon/sun button in the header. Remembered per device.

**On a phone** — tap a bar to see its tooltip; it clears itself after a moment,
or when you scroll or tap elsewhere.

---

## About the numbers

Seeded from `Commission_tracker1.xlsx`, consolidating the 16 separate yearly
tabs (`2008-2011` through `2026 Commissions`) into one dataset of **521 closed
transactions**.

Reconciliation against the workbook's own `Stats` tab matches within 0–3
transactions per year; the differences are legacy dual-side entries counted once
in one place and twice in the other.

Three things worth knowing:

- **Net commission wasn't tracked before 2012.** Those years show gross only,
  and the gross-vs-net chart says so.
- **Ten rows have a mistyped closing date** — e.g. a 2023 sale dated
  `2012-01-04`. They are filed under the year the workbook filed them under
  (which is what reconciles to `Stats`), not the year in the date. You can now
  fix these directly: search the client, click the pencil, correct the date.
  Editing a row *without* changing its date will not re-file it.
- **72 older transactions have no buyer/seller side** and 150 have no property
  type recorded. The charts state their denominators rather than quietly
  dropping them.

---

## Project structure

```
index.html              the whole UI
css/app.css             design system — all brand tokens live at the top
css/fonts.css           self-hosted Montserrat
js/config.js            ← the only file you normally edit
js/seed.js              the 521 historical sales, with deduction lines
js/store.js             data layer (Supabase or local, same API)
js/charts.js            hand-built SVG charts
js/app.js               UI wiring, table, CRUD
assets/                 logo lockups, favicon, fonts
supabase/schema.sql     database setup + security notes
supabase/phase1-lock-writes.sql   makes writing require a sign-in
supabase/phase2-agents.sql        teammates and their payouts
supabase/phase3-deductions.sql    per-sale referral / brokerage / TC columns
supabase/seed.csv       the 521 rows, for manual import if ever needed
deploy.sh               one-command deploy to GitHub Pages
```

No build step, no framework, no npm install. It is plain HTML, CSS, and
JavaScript — open `index.html` and it runs.

**Cache busting.** The `<link>` and `<script>` tags in `index.html` carry a
`?v=xxxxxxxx` build id derived from the asset contents. Without it, GitHub Pages
and the browser keep serving the previous `app.css` / `app.js` after a push —
you get the new HTML with the old styles and dead buttons. If you ever edit an
asset by hand, change that id (any new value works) so browsers refetch.

## Troubleshooting

**Badge says "This device" when it should say "Live"** — the URL or key in
`js/config.js` is wrong, or the SQL hasn't been run. Open the browser console
(F12) for the specific error; the app also shows it in the banner.

**"Live" but no rows** — run `supabase/schema.sql`, then reload; the app seeds
the table on first connect.

**Edits vanish on reload in "This device" mode** — private/incognito browsing
blocks browser storage. The badge will read *Preview* in that case.

**Charts look empty after filtering** — the charts always show the full dataset;
only the table responds to the filters.
