# Quickstart — from zip to live site

Everything is already built. What's left needs *your* login, so it has to be
done from your own machine. Realistically 12 minutes.

## Fastest route: one command

If you're comfortable in Terminal, skip everything below:

```bash
cd ~/Downloads/teamhowe-dashboard   # wherever you unzipped it
bash deploy.sh
```

It installs the GitHub CLI if needed, opens a browser for you to sign in,
creates the repo, pushes, turns on Pages, optionally wires up Supabase, and
prints your live URL. Safe to re-run.

You still have to create the Supabase project by hand (steps 1–4 of Part 2) —
that part is browser-only.

The manual walkthrough below does exactly the same thing with no terminal.

---

You will never need to type a password anywhere except into GitHub's and
Supabase's own sign-in pages.

---

## Right now, with zero setup

Open **`Team Howe Dashboard (preview).html`** (the single file I sent
separately). Full app, all 521 sales, add/edit/delete, dark mode. Nothing to
install. Edits stay on that one computer — that's the only limitation.

Use this to decide whether you like it before spending the 12 minutes below.

---

## Part 1 — GitHub, so it has a web address (6 min)

1. **github.com** → **Sign up** (free). Skip if you have an account.
2. Top-right **+** → **New repository**.
   - *Repository name:* pick something that doesn't advertise itself.
     `th-internal-stats` is better than `team-howe-commissions`.
   - *Public* (GitHub's free plan only publishes public repos).
   - Don't tick "Add a README".
   - **Create repository**.
3. On the empty repo page, click **uploading an existing file**.
4. Unzip `teamhowe-dashboard.zip` on your computer, open the folder, select
   **everything inside it**, and drag it into the browser.
   > Drag the *contents*, not the folder itself — `index.html` has to land at
   > the top level of the repo, not inside a subfolder.
5. **Commit changes**.
6. **Settings** (top of repo) → **Pages** (left sidebar).
7. *Source:* **Deploy from a branch** · *Branch:* **main** · *Folder:* **/ (root)**
   → **Save**.
8. Wait ~60 seconds, refresh. GitHub shows:
   `https://<your-username>.github.io/<repo-name>/`

**That link is live.** It already works — it just isn't shared yet, so anything
you add on your laptop won't show up on Sherri's.

---

## Part 2 — Supabase, so you and Sherri share one set of numbers (6 min)

1. **supabase.com** → **Start your project** → sign in with GitHub (one click,
   you just made the account).
2. **New project**
   - *Name:* `team-howe`
   - *Database password:* let it generate one, then **save it in your password
     manager**. You won't need it for this, but you'll want it later.
   - *Region:* **West US (North California)**
   - **Create new project**, wait ~2 min.
3. Left sidebar → **SQL Editor** → **New query**.
4. Open `supabase/schema.sql` from the unzipped folder, copy **the whole file**,
   paste, **Run**. Expect "Success. No rows returned".
5. Left sidebar → **Settings** (gear) → **API Keys**. You need two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
     (under Settings → **API**, or the **Connect** button at the top)
   - **Publishable key** — starts with `sb_publishable_...`

   > Supabase renamed these in 2025. If your project shows a **Legacy keys**
   > tab with an `anon` `public` key starting `eyJ...`, that works too — but
   > prefer the publishable key, since the legacy ones are being retired at the
   > end of 2026. Either one goes in the same place and behaves identically.
   >
   > Both are safe in a public repo — they're *built* to live in browser code.
   > The one you must never share or commit is the **secret key**
   > (`sb_secret_...`, formerly `service_role`), right below it. Don't touch it.

6. Back in GitHub, open your repo → `js/` → `config.js` → the **pencil** icon.
7. Paste the two values between the quotes:

```js
window.TH_CONFIG = {
  SUPABASE_URL:      'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_xxxxxxxxxxxxxxxxxxxxxx',
```

(The setting is still named `SUPABASE_ANON_KEY` for continuity — paste the
publishable key there.)

8. **Commit changes**. Wait ~60 seconds, then reload your Pages link.

The badge in the header should now read **Live**, and on that first load it
copies all 521 historical sales into the database by itself. Send the link to
Sherri — you're done.

---

## If something looks wrong

| What you see | What it means |
|---|---|
| Badge says **This device** | The URL or key in `config.js` didn't take. The blue banner on the page names the exact error. |
| **Live** but the table is empty | `schema.sql` didn't run. Re-run it, reload. |
| Page is blank / unstyled | Files landed inside a subfolder. `index.html` must sit at the repo root. |
| 404 on the Pages link | Give it another minute; the first publish is the slow one. |

If the automatic seeding ever misfires, `supabase/seed.csv` (Table Editor →
Import data from CSV) and `supabase/seed.sql` (SQL Editor → paste → Run) both
load the same 521 rows manually. You shouldn't need either.

---

## One thing to decide before this holds real numbers

You chose no password, and the repo has to be public. Together that means the
`anon` key is visible to anyone who finds the repo — and the policies in
`schema.sql` let that key **edit and delete**, not just read.

Nothing links to your repo, so nobody will stumble onto it. But "hard to find"
isn't the same as "protected", and this is Sherri's commission history.

The fix is small: keep reading public, require a sign-in to change anything.
`schema.sql` has that version ready to paste at the bottom (Option B) — it
needs a short login screen on the front end to go with it, which I can build
whenever you want it. Worth doing before this becomes the real record.
