# Property of MODU. Unauthorized copying or distribution is prohibited.

---

# Google Web App Deployment Settings (Fix CORS & Enable Login)

## Critical Settings for CORS-Free Operation

To avoid CORS errors and enable the Login overlay (Google auto-login via `Session.getActiveUser()`), deploy the Web App with these **exact** settings:

---

### 1. Open Google Apps Script Editor

- Go to your Google Sheet → **Extensions** → **Apps Script**
- Ensure `GoogleSheetsVersion.gs` is pasted and saved

---

### 2. Deploy as Web App

1. Click **Deploy** → **New deployment**
2. Click the gear icon ⚙️ next to "Select type" → choose **Web app**
3. Configure:

| Setting | Value |
|---------|-------|
| **Description** | Ima Productions Dashboard API (MODU) |
| **Execute as** | **User accessing the web app** ← CRITICAL |
| **Who has access** | **Anyone with a Google account** (or "Anyone" for public) |

4. Click **Deploy**
5. **Copy the Web App URL** (ends with `/exec`)

---

### 3. Update Dashboard

Paste the `/exec` URL into **index.html** (line ~135):

```javascript
window.DASHBOARD_API_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

---

### 4. Why "Execute as: User accessing" is Required

| Setting | CORS Behavior | Login (Session.getActiveUser) |
|---------|---------------|-------------------------------|
| **Execute as: Me** | CORS preflight errors; blocked by browser | Returns YOUR email (not the user's) |
| **Execute as: User accessing** | No CORS (simple requests allowed) | Returns the actual user's email ✓ |

With "User accessing":
- GET requests (`whoami`, `data`, `logo`, `artists`) are simple CORS (no preflight)
- POST requests use `Content-Type: text/plain;charset=utf-8` (avoids preflight)
- `Session.getActiveUser().getEmail()` returns the logged-in user's email (for RBAC via משתמשים sheet)

---

### 5. Test the Deployment

1. Open the dashboard URL (GitHub Pages or local)
2. **Login overlay** should appear with "התחברות למערכת"
3. Click **התחבר**
4. Browser redirects to Google OAuth (if not already signed in)
5. After auth: `fetchWhoami()` returns `{ email, role, brand }`
6. Dashboard loads; Admin sees all billing/fee columns; Staff sees schedules only

---

### 6. Troubleshooting CORS

If you still see CORS errors after deploying with "User accessing":

1. **Check the URL:** Ensure `DASHBOARD_API_URL` in `index.html` ends with `/exec` (not `/dev`)
2. **Redeploy:** After changing the script, create a **New deployment** (don't edit the existing one)
3. **Browser cache:** Clear cache or test in incognito
4. **Network:** Disable VPN/proxy that might block `script.google.com`

---

### 7. RBAC (Admin vs Staff)

The משתמשים sheet determines roles:

| Email | Role | Dashboard Access |
|-------|------|------------------|
| admin@example.com | Admin | Revenue, Fee, Billing buttons, all columns |
| staff@example.com | Staff | Schedules only (no fee/revenue) |

Add users in the **משתמשים** sheet (Email, Role, Name). The backend (`getCurrentUserRole`) checks the email from `Session.getActiveUser()` against this sheet.

---

## Summary

Deploy with **"Execute as: User accessing"** to enable:
- Login overlay with Google auto-auth
- CORS-free GET/POST requests
- Real user email for RBAC (Admin vs Staff)

After deploying, copy the `/exec` URL to `index.html` and test the login flow.
