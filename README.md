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
| **Ledger** | Every entry, with filter and search. Tap an entry to edit or delete it. |
| **Report** | Formal statement for any year → *Print / Save PDF*, *Excel* (Summary, Collections, Expenses sheets), *CSV* |
| **History** | Year-on-year chart, category comparison, each person's contributions across years, full JSON backup |
| **⚙ Settings** | Connection, start a new year, notes for the year (settlements such as "X to get ₹500") |

Tip: on your phone, open the site and choose *Add to Home screen* to use it like an app.

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
