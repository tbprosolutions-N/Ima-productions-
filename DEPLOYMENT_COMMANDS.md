# Property of MODU. Unauthorized copying or distribution is prohibited.

---

# Git Deployment Commands

## Push Complete System Overhaul to GitHub

Follow these PowerShell commands in order to deploy your updated dashboard to GitHub Pages.

---

## Prerequisites

1. ✅ You've updated `window.GOOGLE_CLIENT_ID` in `index.html` (see GOOGLE_SIGNIN_SETUP.md)
2. ✅ You've deployed the updated `GoogleSheetsVersion.gs` to your Google Sheet
3. ✅ You've added authorized users to the משתמשים sheet

---

## PowerShell Commands

### Step 1: Navigate to Project Directory

```powershell
cd "C:\Users\tbsol\Downloads\EMA PRODUCTIONS"
```

### Step 2: Check Git Status

```powershell
git status
```

**Expected output:** Shows modified files (index.html, app.js, styles.css, GoogleSheetsVersion.gs, new .md files)

---

### Step 3: Stage All Changes

```powershell
git add .
```

---

### Step 4: Commit Changes

```powershell
git commit -m "Complete system overhaul: Official Google Sign-In, CORS fix, Spotlight Amber theme

- Implement official Google Identity Services authentication
- Add verifyUser endpoint to check Users sheet authorization
- Update all fetch calls to use Content-Type: text/plain for CORS
- Enhance login overlay with modern Google Sign-In button
- Update Spotlight Amber theme to #FFBF00 gold accent
- Maintain sidebar navigation with mobile responsive design
- Preserve Admin RBAC (hide financial columns for Staff)
- Add comprehensive setup documentation"
```

---

### Step 5: Push to GitHub

```powershell
git push origin main
```

**Note:** If your default branch is `master` instead of `main`, use:

```powershell
git push origin master
```

---

### Step 6: Verify Deployment

1. Go to your GitHub repository: https://github.com/tbprosolutions-N/Ima-productions-.git
2. Click **Settings** → **Pages**
3. Ensure **Source** is set to: `Deploy from a branch`
4. **Branch:** `main` (or `master`), folder: `/ (root)`
5. Click **Save** if needed
6. Wait 1-2 minutes for GitHub Pages to rebuild
7. Visit your live site: `https://tbprosolutions-N.github.io/Ima-productions-/`

---

## Troubleshooting

### "fatal: not a git repository"

Initialize Git first:

```powershell
git init
git remote add origin https://github.com/tbprosolutions-N/Ima-productions-.git
git branch -M main
```

Then repeat Steps 3-5.

---

### "Author identity unknown"

Set your Git identity:

```powershell
git config user.email "tbprosolutions-N@users.noreply.github.com"
git config user.name "tbprosolutions-N"
```

Then repeat Step 4-5.

---

### "failed to push some refs"

Pull remote changes first:

```powershell
git pull origin main --rebase
```

Then repeat Step 5.

---

### "Authentication failed"

Use a Personal Access Token (PAT) instead of password:

1. Go to: https://github.com/settings/tokens
2. Click **Generate new token (classic)**
3. Scopes: Select `repo`
4. Copy the token
5. When prompted for password during `git push`, paste the token

---

## Post-Deployment Checklist

After pushing to GitHub:

- [ ] Visit your live site: `https://tbprosolutions-N.github.io/Ima-productions-/`
- [ ] Login overlay appears with "Sign in with Google" button
- [ ] Click login → Google account picker opens
- [ ] Select your Google account → Dashboard loads
- [ ] Verify your role (Admin or Staff) is applied correctly
- [ ] Test on mobile (iPhone): Menu toggle, FAB button, sidebar
- [ ] Test creating a new booking
- [ ] Verify CORS errors are gone (check browser console)

---

## Quick Reference

### View Recent Commits
```powershell
git log --oneline -5
```

### Undo Last Commit (keep changes)
```powershell
git reset --soft HEAD~1
```

### Discard All Local Changes
```powershell
git reset --hard HEAD
```

### Create a New Branch
```powershell
git checkout -b feature/new-feature
```

### Switch Back to Main
```powershell
git checkout main
```

---

## Files Modified in This Overhaul

| File | Status | Description |
|------|--------|-------------|
| `index.html` | Modified | Added Google Identity Services, new login overlay, GOOGLE_CLIENT_ID |
| `app.js` | Modified | Implemented official Google Sign-In, updated all fetch calls to text/plain |
| `styles.css` | Modified | Enhanced login styles, updated Spotlight Amber to #FFBF00 |
| `GoogleSheetsVersion.gs` | Modified | Added verifyUser endpoint for user authorization |
| `GOOGLE_SIGNIN_SETUP.md` | New | Complete setup guide for Google OAuth |
| `DEPLOYMENT_COMMANDS.md` | New | This file - Git deployment instructions |
| `UI_UPGRADE_NOTES.md` | Existing | Previous UI upgrade documentation |
| `WEB_APP_SETUP.md` | Existing | Web App deployment settings |

---

## Summary

Your dashboard now has:

✅ **Official Google Sign-In** with account picker
✅ **User authorization** via משתמשים sheet
✅ **CORS fix** on all API calls
✅ **Spotlight Amber theme** (#FFBF00)
✅ **Mobile responsive** sidebar + FAB button
✅ **Admin RBAC** (hide financial data for Staff)
✅ **Production-ready** for GitHub Pages

---

## Need Help?

- **Google Sign-In issues:** See `GOOGLE_SIGNIN_SETUP.md`
- **Web App deployment:** See `WEB_APP_SETUP.md`
- **UI/UX questions:** See `UI_UPGRADE_NOTES.md`
- **Git errors:** See Troubleshooting section above

---

**Ready to deploy? Run the commands above! 🚀**
