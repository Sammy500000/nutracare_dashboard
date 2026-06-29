# Valencia NutraCare LifeSciences — Investor Dashboard

An interactive 5-year financial model + Go-To-Market dashboard, built from the source
workbook (`22 Cr Nutracare Project (Final).xlsx`) and the Go-To-Market deck, with
**two-way Google Sheets sync** via Vercel serverless functions.

## Access (login gate)

- **Username:** `vnls`
- **Password:** `nutracare@1234`

Credentials are checked client-side against SHA-256 hashes (the plaintext is not stored in
source). Auth persists for the browser session; a **Sign out** button is in the header.

> This is a lightweight access gate for a confidential investor link, not server-enforced
> security. For hard access control, also enable **Vercel Deployment Protection**
> (Project → Settings → Deployment Protection → Password Protection).

## How the data flows (two-way sync)

The Google Sheet is the **single source of truth**. A dedicated **`Dashboard` tab**
(auto-created on first load) holds every value the dashboard uses, in clean labelled rows:

- **Sheet → dashboard:** on login + the header **⟳ Sync** button, the dashboard pulls the
  `Dashboard` tab through `/api/sheet` (GET). Edit any value in that tab → it shows up on the
  next sync. *(Google can't push to a static page, so updates are pull-based.)*
- **Dashboard → sheet:** editing the production **Drivers**, the **Indirect-Expense** table,
  or picking a **scenario preset** writes those inputs back to the tab through `/api/sheet`
  (POST). The header chip shows **Sheet connected / Saving… / Saved / Offline**.

If the API isn't reachable yet (before you finish setup), the dashboard falls back to the
built-in figures and shows an **"Offline · built-in data"** chip — it never breaks.

## One-time setup (≈20 min)

### 1. Create a Google service account
1. Go to <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library → enable "Google Sheets API"**.
3. **IAM & Admin → Service Accounts → Create service account** (e.g. `vnls-dashboard`).
4. Open it → **Keys → Add key → Create new key → JSON**. A `.json` file downloads.
5. Copy the service account's email — it looks like
   `vnls-dashboard@<project>.iam.gserviceaccount.com`.

### 2. Share the sheet with the service account
Open **"Copy of 22 Cr Nutracare Project (Final)"** → **Share** → paste the service-account
email → give it **Editor** → Send. (Editor is required so it can create the `Dashboard` tab
and write inputs back.)

### 3. Add environment variables in Vercel
Project → **Settings → Environment Variables** (see `.env.example`):

| Name | Value |
|------|-------|
| `SHEET_ID` | `12CKIXn5AtHlVgJ9JB1Co7bADeFaphcXYgq59dgZk8Kk` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | the **entire JSON** from step 1 (paste as one value), or its base64 |
| `DASHBOARD_TAB` | `Dashboard` *(optional)* |
| `API_SECRET` | *(optional)* a random string for a soft API guard |

> Tip: if pasting raw JSON gives trouble, base64-encode the file first
> (`base64 -w0 key.json`) and paste that — the function accepts either.
>
> If you set `API_SECRET`, also set `CONFIG.apiToken` to the **same** value near the top of
> the `<script>` in `index.html`, then redeploy. Otherwise leave both blank.

### 4. Deploy
- Push this folder to a Git repo → Vercel **Add New → Project** → import it.
- Framework preset **Other**, no build command, output dir `./`. Deploy.
- Or via CLI: `npm i -g vercel` then `vercel --prod`.

Vercel auto-detects `/api/sheet.js` as a serverless function and installs `googleapis`
from `package.json`. On first visit the `Dashboard` tab is created and seeded automatically.

## What's inside

- **Overview** — revenue, EBITDA, PAT, IRR, NPV with live charts.
- **Drivers** — editable production drivers + indirect expenses, live recalculation, and
  **Conservative / Base / Aggressive** scenario presets (all synced to the sheet).
- **Year 1–5** — per-year P&L, revenue composition, cost structure.
- **Returns** — reconstructed IRR / NPV / payback / ROCE (the workbook's own cells evaluate
  to `#REF!`; methodology documented in-app).
- **Financing** — ₹820.7 Cr capital plan, capex/depreciation, debt schedule.
- **Go-To-Market** — population reached (1.04L→31.7L mothers, 32.7K→43.7L babies),
  CSR de-risking (80%→60%), channel & tier revenue, category revenue evolution, brand
  architecture, distribution-chain margins.
- **Products** — pricing and per-box unit economics, 4 categories × 3 tiers.
- **Data Appendix** — every sheet of the source workbook, browsable.

Mobile-optimised (responsive grids, wrapping header controls, scrollable tables/nav) and
includes **Export PDF** (print) for sharing.

## Files

| File | Purpose |
|------|---------|
| `index.html` | the dashboard (served at `/`) |
| `VNLS_Dashboard.html` | identical copy of `index.html` |
| `api/sheet.js` | serverless GET/POST bridge |
| `lib/sheets.js` | Google Sheets auth + read/write + the `Dashboard` tab schema/seed |
| `vercel.json` | clean URLs + security headers |
| `package.json` | `googleapis` dependency |
| `.env.example` | the env vars to set in Vercel |

> After editing `index.html`, copy it over `VNLS_Dashboard.html` (or vice-versa) to keep
> both in sync, then redeploy.

## Reset the data

To re-seed the model from the built-in canonical values, delete the `Dashboard` tab in the
sheet and reload the dashboard — it will recreate and seed it.
