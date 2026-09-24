# Lakshmi Puja Accounts

A small, puja-themed website for logging this year's **collections** and **expenses** from your phone or laptop, and for pulling out reports (print/PDF, Excel, CSV) for any year, including 2021, 2023 and 2025 imported from the old Excel sheets.

- **This repo (public)** holds only the website code. It is served by GitHub Pages.
- **`laxmi_puja_private` (private repo)** holds the money data: `years/<year>.json`. The site reads and writes it with a GitHub token you paste once per device. Every save is a commit, so you get a full history of every change.

No server, no database, no monthly cost.

## One-time setup

1. **Website repo (public)**
   Pushed to the public repo `india-babai/laxmi_puja_pub`. `.gitignore` already keeps `past expenditure files/` and `puja-data/` out of it.
   Then go to repo → *Settings → Pages* → Source: *Deploy from a branch* → `main` / root.
   Your site will be at `https://india-babai.github.io/laxmi_puja_pub/`.

2. **Data repo (PRIVATE)**
   The local `puja-data/` folder is pushed to the **private** repo `india-babai/laxmi_puja_private`:
   ```
   cd puja-data
   git init -b main && git add . && git commit -m "Import 2021-2025 history"
   git remote add origin https://github.com/india-babai/laxmi_puja_private.git
   git push -u origin main
   ```

3. **Token**
   github.com → Settings → Developer settings → *Fine-grained tokens* → Generate new token
   - Repository access: *Only select repositories* → `laxmi_puja_private`
   - Permissions → Repository → **Contents: Read and write** (nothing else)
   - Pick an expiry (for example 1 year). When it expires, generate a new one and paste it again.

4. Open the site → it shows the setup screen → enter `india-babai`, `laxmi_puja_private` and the token → **Test & save**. Repeat step 4 on each phone or laptop.

## Using it

| Where | What |
|---|---|
| **Home** | Balance / shortfall, collected vs spent, category breakdown, *Yet to receive* (people who gave last year but not yet this year; tap one to log it with last year's amount pre-filled), *Money with people* (who holds cash and who is owed) |
| **＋** | Add a collection or expense. Names and items auto-suggest from past years, and the category fills itself in. |
| **📷 Scan** | Photo of a handwritten expense or collection list → AI reads it → you check and edit the rows → added in one go (see below) |
| **Ledger** | Every entry, with filter and search (including *📎 With receipts*). Tap an entry to edit or delete it. Tap 📎 to see its receipts. |
| **Receipts** | In the entry form, *📎 Add photos / PDF* or *📷 Camera* attaches as many bills as you like. Photos are shrunk to about 200–400 KB before upload and stored in the private repo under `receipts/<year>/`. They open in a full-screen viewer from the ledger and the report (*See bills*), for view-only family links too. |
| **Report** | Formal statement for any year → *Print / Save PDF*, *Excel* (Summary, Collections, Expenses sheets), *CSV* |
| **History** | Year-on-year chart, category comparison, each person's contributions across years, full JSON backup |
| **⚙ Settings** | Connection, start a new year, notes for the year (settlements such as "X to get ₹500") |

Tip: on your phone, open the site and choose *Add to Home screen* to use it like an app.

## Scanning a handwritten list (AI)

Home → **📷 Scan a handwritten list** (or the link at the top of the Add form).

1. Choose what's on the paper: **Expenses / payments** or **Collections received**.
2. Take or choose a photo. Claude (Anthropic's AI model, Claude Opus 5) reads it. It's given your categories and past item and person names, so the spellings match.
3. **Review screen:** each row can be edited or unticked, hard-to-read rows are highlighted, "all rows" fields cover date / paid by / mode, and the rows' sum is checked against any total written on the paper. Nothing is saved until you tap **Add**.
4. The entries are saved in one go, all sharing the photo as their receipt, and marked "📷 From scanned list". The Ledger has a *📷 From scans* filter.

**Setup (once, on your own device):** console.anthropic.com → buy credit (for example $5) → create an API key → ⚙ Settings → *Scan handwritten lists* → paste → **Save & test**. The key stays in that browser only. View-only family links never see it.

**Cost:** roughly ₹3–6 per scan. To keep it low, the photo is sent as a ~1400px JPEG, the instructions are short, effort is set to "low", and the reply is a compact list. Settings shows an estimate of what this device has used. The exact balance is on the Anthropic console.

## Sharing with family (view only)

1. Create a **second** fine-grained token (e.g. *puja-viewers*): only `laxmi_puja_private`, **Contents: Read-only**.
2. On your own device: ⚙ Settings → **Share a view-only link** → paste that token → **Create link** → copy or share it (WhatsApp etc.).
3. Anyone who opens the link sees Home, Ledger, Report (PDF/Excel/CSV) and History. There's no ＋ button, entries can't be edited, and GitHub itself rejects writes from that token.

Anyone who has the link can view the accounts, and the link can be forwarded. To cut off access, delete the *puja-viewers* token on GitHub, create a new one, and send a new link.

## Local preview

```
python -m http.server 8765
```
Open http://localhost:8765 → *Try demo mode*. Locally, demo mode loads the real history from `puja-data/`. Demo data stays in that browser only.

## Security notes

- The token lives in the browser's local storage on each device where you enter it. Anyone who can use that unlocked browser could edit the data, so use **Disconnect this device** on shared computers.
- The token can only touch the `laxmi_puja_private` repo. If a phone is lost, revoke the token on GitHub.
- The public site contains no amounts or names. Everything loads from the private repo only after a valid token is entered.
