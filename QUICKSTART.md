# Quick Start Guide

## 🚀 Get IMA OS Running in 5 Minutes

### Prerequisites Check
```bash
node --version  # Should be 18+
npm --version   # Should be 9+
```

### Step 1: Install
```bash
npm install
```

### Step 2: Configure Supabase

1. **Create Project**: Go to https://supabase.com and create new project
2. **Get Credentials**: 
   - Project Settings → API
   - Copy "Project URL" and "anon public" key
3. **Create Environment File**:
```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 3: Setup Database

1. Go to Supabase → SQL Editor
2. Copy entire contents of `supabase/schema.sql`
3. Paste and click "Run"
4. Wait for success message

### Step 4: Create Admin User

1. Supabase → Authentication → Users → "Add User"
2. Fill in:
   - Email: `modu.general@gmail.com`
   - Password: (create a strong password)
3. Click "Create User"
4. Find the user → Click "..." → Edit User
5. Add to "User Metadata" (Raw JSON):
```json
{
  "full_name": "Noa Tibi",
  "role": "owner"
}
```
6. Save

### Step 5: Launch
```bash
npm run dev
```

Open: http://localhost:3000

### Step 6: Login

- **Email**: modu.general@gmail.com
- **Password**: (the password you created)
- **Company ID**: IMA (or any text)

Click "התחבר" (Sign In)

---

## ✅ You're In!

Complete the setup wizard and explore:
- Dashboard with KPIs
- Events master table
- Business switcher
- Theme toggle (sun/moon icon)

---

## 🎨 Test Features

1. **Switch Business**: Top of sidebar → Click dropdown
2. **Toggle Theme**: Sidebar → Sun/Moon icon
3. **Create Event**: Events → "אירוع חדש" button
4. **Export Data**: Events → "ייצא לדוח" button
5. **Search**: Events → Type in search box

---

## 🐛 Troubleshooting

### "Cannot connect to Supabase"
- Check `.env` file exists and has correct values
- Restart dev server: Ctrl+C then `npm run dev`

### "No data showing"
- Database schema may not be applied
- Re-run `supabase/schema.sql` in SQL Editor

### "Login fails"
- Check admin user was created in Supabase Auth
- Verify user metadata includes "role": "owner"

### "npm install fails"
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again
- Check Node version is 18+

---

## 📖 Next Steps

- Read `SETUP.md` for detailed documentation
- Read `IMPLEMENTATION.md` for feature list
- Read `README.md` for project overview

---

## 🎉 Enjoy IMA OS!

Built with ❤️ for professional agency management.
