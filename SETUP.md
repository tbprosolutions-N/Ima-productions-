# IMA OS - Setup & Deployment Guide

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- Morning/GreenInvoice integration (optional, server-side only)

### Installation

1. **Install dependencies**
```bash
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_MORNING_API_URL=https://api.morning.co.il/v1
VITE_DEMO_BYPASS=false
```

3. **Set up Supabase database**

Go to your Supabase project **SQL Editor** and run:

- **New project (recommended clean install)**: run `supabase/schema-clean.sql`
- **Existing project where Auth users already exist and `public.users` is empty**:
  - run `supabase/ensure_user_profile.sql` (adds the RPC used by login self-heal)
  - run `supabase/backfill_users.sql` (populates `public.users` from `auth.users`)

Or use the Supabase CLI:
```bash
supabase db push
```

4. **Create admin user**

Go to Supabase Authentication → Add User manually:
- Email: `modu.general@gmail.com`
- Password: (set a secure password)
- User Metadata:
```json
{
  "full_name": "Noa Tibi",
  "role": "owner"
}
```

5. **Start development server**
```bash
npm run dev
```

Visit `http://localhost:3001` (port may differ if 3000 is in use)

## ✅ Health / E2E QA

- `http://localhost:3001/health` (dev-only): runs an end-to-end QA suite for auth/profile/RLS/storage/CRUD.

## 📁 Project Structure

```
OS/
├── src/
│   ├── components/
│   │   ├── ui/                 # Reusable UI components (Button, Input, Card, etc.)
│   │   ├── BusinessSwitcher.tsx
│   │   ├── MainLayout.tsx
│   │   ├── SetupWizard.tsx
│   │   └── Sidebar.tsx
│   ├── contexts/               # React Context providers
│   │   ├── AgencyContext.tsx
│   │   ├── AuthContext.tsx
│   │   ├── LocaleContext.tsx
│   │   └── ThemeContext.tsx
│   ├── lib/                    # Core libraries
│   │   ├── supabase.ts
│   │   └── utils.ts
│   ├── pages/                  # Page components
│   │   ├── ArtistsPage.tsx
│   │   ├── CalendarPage.tsx
│   │   ├── ClientsPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── DocumentsPage.tsx
│   │   ├── EventsPage.tsx
│   │   ├── FinancePage.tsx
│   │   ├── LoginPage.tsx
│   │   └── SettingsPage.tsx
│   ├── services/               # External service integrations
│   │   ├── agreementService.ts
│   │   └── (Morning integration is server-side via Supabase Edge Functions)
│   ├── types/                  # TypeScript type definitions
│   │   ├── database.ts
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   ├── schema-clean.sql        # Canonical schema (production-ready, RLS, triggers)
│   ├── ensure_user_profile.sql # Login self-heal RPC (run once if missing)
│   └── backfill_users.sql      # Backfill `public.users` from `auth.users` (run once if needed)
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```

## 🎨 Features Implemented

### ✅ Core Features
- [x] Multi-tenant architecture (IMA, Bar, Nightclub)
- [x] Obsidian-Magenta theme with Dark/Light mode
- [x] RTL/LTR language support (Hebrew/English)
- [x] Email/Password + Magic Link authentication
- [x] WebAuthn placeholders (FaceID/Biometrics ready)
- [x] Role-Based Access Control (Producer, Finance, Manager, Owner)
- [x] Privacy Law compliance (Amendment 13)

### ✅ Dashboard
- [x] KPI cards with AI insights
- [x] Real-time data from Supabase
- [x] Joyride guided tour for onboarding
- [x] Role-based data visibility

### ✅ Events Management
- [x] Master table with TanStack Table
- [x] Sorting, filtering, and pagination
- [x] Inline editing capability
- [x] Status management
- [x] Export to report functionality

### ✅ Automation
- [x] Database triggers for CRM sync
- [x] Auto-create clients from events
- [x] Auto-set weekday from event date
- [x] Morning.co.il API integration
- [x] Agreement generation service

### 🔄 In Progress / Placeholders
- [ ] FullCalendar view
- [ ] Finance module with monthly checklist
- [ ] OCR expense upload
- [ ] Email service integration
- [ ] Advanced inline editing
- [ ] Export to Excel/PDF

## 🔐 Security Features

### Row-Level Security (RLS)
All tables have RLS policies ensuring:
- Users can only access data from their agency
- Producers cannot see financial data
- Only owners and managers can delete records

### Authentication
- Supabase Auth with JWT tokens
- Automatic session refresh
- Magic link support
- WebAuthn ready (placeholder)

### Compliance
- Israeli Privacy Law (Amendment 13) footer
- Terms & conditions consent
- Audit logging via database triggers

## 🎯 Role-Based Access Control

| Feature | Producer | Finance | Manager | Owner |
|---------|----------|---------|---------|-------|
| View Events | ✅ | ✅ | ✅ | ✅ |
| Create Events | ✅ | ✅ | ✅ | ✅ |
| View Revenue | ❌ | ✅ | ✅ | ✅ |
| Finance Module | ❌ | ✅ | ✅ | ✅ |
| Delete Events | ❌ | ❌ | ✅ | ✅ |
| Settings | ❌ | ❌ | ✅ | ✅ |

## 🌐 API Integrations

### Morning.co.il API
Located in `src/services/morningAPI.ts`

Features:
- Invoice generation
- Receipt generation
- Email delivery
- Auto-sync with events

Usage:
```typescript
import { morningAPI } from '@/services/morningAPI';

// Create invoice from event
await morningAPI.createInvoiceFromEvent(eventId);

// Create receipt
await morningAPI.createReceiptFromEvent(eventId, 'credit');
```

### Agreement Service
Located in `src/services/agreementService.ts`

Features:
- PDF generation from templates
- Variable substitution
- Email delivery
- Hebrew RTL support

Usage:
```typescript
import { agreementService } from '@/services/agreementService';

// Generate and download
await agreementService.downloadAgreement(eventId);

// Generate and email
await agreementService.generateAgreement({
  eventId,
  sendEmail: true
});
```

## 🎨 Theming

### Color Palette

**Dark Mode (Default):**
- Background: `#0B0B0B` (Obsidian)
- Surface: `#1A1A1A`
- Primary: `#A82781` (Magenta)
- Text: `#FFFFFF`

**Light Mode:**
- Background: `#F8F9FA`
- Surface: `#FFFFFF`
- Primary: `#A82781` (Magenta)
- Text: `#0B0B0B`

### Custom Classes
```css
.btn-magenta      /* Primary button with hover effects */
.btn-obsidian     /* Secondary dark button */
.glass            /* Glass morphism effect (dark) */
.glass-light      /* Glass morphism effect (light) */
```

## 📦 Build & Deploy

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### Deploy to Netlify
```bash
# Build
npm run build

# Deploy dist/ folder to Netlify
```

### Environment Variables in Production
Make sure to set these in your hosting platform:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_MORNING_API_URL`
- `VITE_DEMO_BYPASS` (must be `false`)

## 🐛 Troubleshooting

### Supabase Connection Issues
- Verify your `.env` file has correct credentials
- Check Supabase project status
- Ensure RLS policies are applied

### Build Errors
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### RTL Layout Issues
- Make sure `<html lang="he" dir="rtl">` is set
- Check LocaleContext is wrapping the app

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Router Documentation](https://reactrouter.com)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [Framer Motion Documentation](https://www.framer.com/motion)
- [TanStack Table Documentation](https://tanstack.com/table)

## 🤝 Support

For issues or questions, contact: modu.general@gmail.com

## 📄 License

Proprietary - © 2026 IMA OS
