# Property of MODU. Unauthorized copying or distribution is prohibited.

---

# Deployment Guide – Ima Productions SaaS | Spotlight Amber (GitHub & GitHub Pages)

Step-by-step instructions to deploy the dashboard so the **live URL is clean**:  
**`https://YOUR_USERNAME.github.io/YOUR_REPO/`** (no `/Dashboard/` in the path).

---

## 1. Prerequisites

- **`index.html`**, **`app.js`**, and **`styles.css`** are in the **repository root** (not in a subfolder). All paths in `index.html` are relative (`styles.css`, `app.js`).
- Set **`window.DASHBOARD_API_URL`** in `index.html` to your Google Web App URL (the one that ends with `/exec`). You can set this after creating the Web App and paste the URL there.
- Set **`window.TERMS_URL`** in `index.html` to your SLA/Terms document URL, or leave as `'#'` to disable.
- All source files include the legal header: *"Property of MODU. Unauthorized copying or distribution is prohibited."*

---

## 2. Exact Git Commands – Initialize and Push to GitHub

Run these in the **project root** (the folder that contains `index.html`, `app.js`, `styles.css`, `GoogleSheetsVersion.gs`, `README.md`).

### Step A – Create the repository on GitHub

1. Go to **[github.com/new](https://github.com/new)**.
2. Repository name: e.g. `ima-productions-dashboard` or `ema-productions`.
3. Choose **Private** or **Public**. Do **not** check “Add a README file”.
4. Click **Create repository**. Leave the page open; you will need the repo URL.

### Step B – Run these commands (Windows PowerShell or Command Prompt)

```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
git init
git add .
git status
git commit -m "Initial commit: Ima Productions SaaS dashboard (MODU)"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Replace **`YOUR_USERNAME`** and **`YOUR_REPO`** with your GitHub username and repository name. Example:

```powershell
git remote add origin https://github.com/modugeneral/ima-productions-dashboard.git
git push -u origin main
```

If Git asks for credentials, use your GitHub username and a **Personal Access Token** (not your password). Alternatively use SSH: `git@github.com:YOUR_USERNAME/YOUR_REPO.git`.

---

## 3. GitHub Pages – Enable and Get Your Live URL

1. Open your repository on GitHub.
2. Go to **Settings** → **Pages** (left sidebar).
   - Direct link: **[GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publish-source-for-github-pages)**.
3. Under **Build and deployment**:
   - **Source**: Deploy from a branch.
   - **Branch**: `main` (or `master`).
   - **Folder**: **/ (root)**.
4. Click **Save**. After a minute or two, GitHub will show: *“Your site is live at `https://YOUR_USERNAME.github.io/YOUR_REPO/`.”*

Because **`index.html`** is in the repository root, the dashboard is served at the **root URL** (no `/Dashboard/`):

- **Live URL:** **`https://YOUR_USERNAME.github.io/YOUR_REPO/`**

Example: `https://modugeneral.github.io/ima-productions-dashboard/`

Share this link with your client.

---

## 4. After Deployment

1. **Web App URL:** In Google Apps Script, deploy the Web App and copy the `/exec` URL into `index.html` → `window.DASHBOARD_API_URL`. Commit and push if the repo is already live.
2. **CORS:** Google Apps Script Web Apps allow requests from any origin; the dashboard on GitHub Pages will work.
3. **Terms / Logo:** Set `window.TERMS_URL` in `index.html` if you use a terms page. Ensure the LOGO file is in the Drive root folder so the header logo loads.

Your client can use the GitHub Pages URL as soon as the first deploy completes.

---

## 5. Final Git Commands – Push Master Version (Spotlight Amber)

After applying the **Spotlight Amber** rebrand and all packaging, push the master version:

```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
git add .
git status
git commit -m "Master: Spotlight Amber brand, Inter/Assistant, MODU packaging"
git push origin main
```

If the repo is not yet initialized:

```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
git init
git add .
git commit -m "Master: Ima Productions SaaS | Spotlight Amber (MODU)"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub username and repository name.

---

## 6. Functional Audit Summary (Step 3)

| Check | Status |
|-------|--------|
| **AUTHORIZED_SPREADSHEET_ID lock** | Implemented in all critical entry points: `doGet`, `doPost`, `addNewBooking`, `sendPaymentRequestForBooking`, `emailDailySnapshot`, `sendDailyEmergencyBackup`. Lock is active when `AUTHORIZED_SPREADSHEET_ID` is set to a real spreadsheet ID (not `YOUR_*`). |
| **Morning API anti-duplicate** | Backend sets status to `"Payment Sent"` after successful Morning call. Dashboard (`app.js`) shows the "Send Payment" button only when status is not `payment sent`; for rows with `Payment Sent` it shows the message "דרישת תשלום כבר נשלחה" and no button, so duplicates are prevented. |
| **Daily backup trigger** | `dailyBackup()` exports הזמנות to CSV in the **"Backups"** folder under the **root Drive folder** (Emergency Backup location). Run `installDailyBackupTrigger()` once from the script editor to enable daily 2:00 run. |

---

## 7. Push to Your Repository (tbprosolutions-N / Ima-productions-)

Use these **exact** commands to push the finalized MODU SaaS (Spotlight Agency) to your repo:

```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
git add .
git status
git commit -m "Finalize MODU SaaS: Spotlight Agency packaging, legal headers, functional audit"
git branch -M main
git remote add origin https://github.com/tbprosolutions-N/Ima-productions-.git
git push -u origin main
```

If the repo is **already** initialized and has a different remote:

```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
git remote set-url origin https://github.com/tbprosolutions-N/Ima-productions-.git
git add .
git status
git commit -m "Finalize MODU SaaS: Spotlight Agency packaging, legal headers, functional audit"
git push -u origin main
```

If Git asks for credentials, use your GitHub username and a **Personal Access Token** (not your password).
