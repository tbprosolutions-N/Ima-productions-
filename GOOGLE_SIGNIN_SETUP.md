# Property of MODU. Unauthorized copying or distribution is prohibited.

---

# Google Sign-In Setup Guide

## Complete System Overhaul - Official Google Authentication

Your dashboard now uses **official Google Identity Services** for authentication. Follow these steps to complete the setup.

---

## 🔐 Step 1: Get Google OAuth Client ID

### 1.1 Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### 1.2 Create or Select a Project
- Click the project dropdown (top left)
- Create a new project: "Ima Productions Dashboard"
- Or select an existing project

### 1.3 Enable Google Identity Services API
- Go to **APIs & Services** → **Library**
- Search for "Google Identity Services"
- Click **Enable**

### 1.4 Create OAuth 2.0 Client ID
1. Go to **APIs & Services** → **Credentials**
2. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - User Type: **Internal** (if using Google Workspace) or **External**
   - App name: **Ima Productions Dashboard**
   - User support email: Your email
   - Developer contact: Your email
   - Scopes: Add `email` and `profile`
   - Test users: Add your admin emails
   - Click **Save and Continue**

4. Create OAuth Client ID:
   - Application type: **Web application**
   - Name: **Ima Productions Web Client**
   - Authorized JavaScript origins:
     - `https://yourusername.github.io`
     - `http://localhost:8000` (for local testing)
   - Authorized redirect URIs:
     - `https://yourusername.github.io/Ima-productions-/`
   - Click **CREATE**

5. **Copy the Client ID** (looks like: `123456789-abc123.apps.googleusercontent.com`)

---

## 📝 Step 2: Update index.html with Your Client ID

Open `index.html` and find line ~215:

```javascript
window.GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
```

Replace `YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com` with your actual Client ID from Step 1.4.

**Example:**
```javascript
window.GOOGLE_CLIENT_ID = '123456789-abc123def456.apps.googleusercontent.com';
```

---

## 🚀 Step 3: Deploy Google Apps Script Backend

### 3.1 Update GoogleSheetsVersion.gs
The backend now includes a new `verifyUser` endpoint that checks if the Google-authenticated user exists in your **משתמשים (Users)** sheet.

### 3.2 Deploy the Web App
1. Open your Google Sheet → **Extensions** → **Apps Script**
2. Paste the updated `GoogleSheetsVersion.gs` code
3. Click **Deploy** → **New deployment**
4. Settings:
   - **Execute as:** User accessing the web app ← CRITICAL
   - **Who has access:** Anyone with a Google account
5. Click **Deploy**
6. **Copy the Web App URL** (ends with `/exec`)

### 3.3 Verify API URL in index.html
Ensure line ~214 has your correct Web App URL:

```javascript
window.DASHBOARD_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

---

## 👥 Step 4: Configure Users in Google Sheet

### 4.1 Open the "משתמשים" (Users) Sheet
Your Google Sheet should have a tab named **משתמשים** with these columns:

| Email | Role | Name |
|-------|------|------|
| admin@example.com | Admin | Admin Name |
| staff@example.com | Staff | Staff Name |

### 4.2 Add Authorized Users
- **Email:** Must match the Google account email exactly
- **Role:** Either `Admin` or `Staff`
  - **Admin:** Can see revenue, fees, billing columns, and all financial data
  - **Staff:** Can only see schedules, artist names, venues (no financial info)
- **Name:** Display name (optional)

**Example:**
```
admin@imaproductions.com | Admin | Noa Cohen
manager@imaproductions.com | Staff | David Levi
```

---

## 🎨 Step 5: UI/UX Features

### New Login Experience
- **Official Google Sign-In button** (black "Sign in with Google" button)
- **Account picker** opens automatically when user clicks login
- **Branding:** "אמא הפקות" with 🎵 icon
- **Spotlight Amber theme:** Dark background (#06080C) with gold accents (#FFBF00)

### Sidebar Navigation
- 📊 דאשבורד (Dashboard)
- 📅 אירועים (Events)
- 🎤 אמנים (Artists)
- 💰 כספים (Finance)
- ⚙️ הגדרות (Settings)

### Mobile Responsive
- **FAB button (+)** for quick "New Booking" on mobile
- **Menu toggle (☰)** to open/close sidebar
- Sidebar slides in from right on mobile

### Admin RBAC
- **Admin users:** See all columns including Fee, Revenue, billing buttons
- **Staff users:** Financial columns are hidden automatically

---

## 🔧 Step 6: CORS Fix Applied

All fetch calls now use:
```javascript
headers: { 'Content-Type': 'text/plain;charset=utf-8' }
```

This prevents "Blocked by CORS policy" errors when calling your Google Apps Script Web App.

---

## ✅ Step 7: Test the System

### 7.1 Local Testing (Optional)
```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
python -m http.server 8000
```
Open: http://localhost:8000

### 7.2 Test Login Flow
1. Open the dashboard
2. **Login overlay** should appear with "Sign in with Google" button
3. Click the button → **Google account picker** opens
4. Select your Google account
5. Dashboard verifies your email against the משתמשים sheet
6. If authorized: Dashboard loads with appropriate role view
7. If unauthorized: Error message: "המשתמש [email] אינו מורשה"

### 7.3 Test Admin vs Staff
- **Admin login:** Revenue/Fee columns visible, billing buttons enabled
- **Staff login:** Revenue/Fee columns hidden

### 7.4 Test Mobile
- Open on iPhone
- Tap menu (☰) → Sidebar slides in
- Tap FAB (+) → New booking modal opens
- Verify all functionality works

---

## 🐛 Troubleshooting

### "Error: לא הוגדר Google Client ID"
- You forgot to update `window.GOOGLE_CLIENT_ID` in `index.html`
- Go back to Step 2

### "המשתמש [email] אינו מורשה"
- The user's email is not in the משתמשים sheet
- Add the email to the sheet with role "Admin" or "Staff"

### "Blocked by CORS policy"
- Ensure Web App is deployed as "Execute as: User accessing"
- Redeploy the Web App if you changed the script
- Clear browser cache and test in incognito

### Google Sign-In button doesn't appear
- Check browser console for errors
- Verify `GOOGLE_CLIENT_ID` is correct
- Ensure you added your domain to "Authorized JavaScript origins" in Google Cloud Console

### "Invalid OAuth client"
- Your domain is not in "Authorized JavaScript origins"
- Add `https://yourusername.github.io` to Google Cloud Console credentials

---

## 📦 Next: Deploy to GitHub Pages

See the Git commands at the end of this guide to push your changes to GitHub.

---

## 🔒 Security Notes

- **Client ID is public** - It's safe to include in your frontend code
- **User verification** happens on the backend (Google Apps Script)
- **Role-based access** is enforced by checking the משתמשים sheet
- **Audit logging** records all login attempts in the LOGS sheet

---

## Summary of Changes

| File | Changes |
|------|---------|
| **index.html** | Added Google Identity Services library, new login overlay HTML, GOOGLE_CLIENT_ID config |
| **app.js** | Implemented `initGoogleSignIn()`, `handleGoogleSignIn()`, `verifyUserWithBackend()`, updated all fetch calls to use text/plain |
| **styles.css** | Updated login overlay styles, changed accent color to #FFBF00 (Spotlight Amber) |
| **GoogleSheetsVersion.gs** | Added `verifyUser` endpoint in `doGet()` to check user authorization |

---

Your dashboard is now production-ready with official Google Authentication! 🎉
