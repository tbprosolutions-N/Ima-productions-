# Property of MODU. Unauthorized copying or distribution is prohibited.

---

# אמא הפקות — Ima Productions SaaS | Spotlight Amber

**Spotlight Agency** brand identity: **Spotlight Amber** — high-contrast gradients, refined glassmorphism, Amber/Indigo theme.  
Proprietary SaaS by **MODU** for **אמא הפקות** (Ima Productions).

## English

### Overview

**Ima Productions** is a proprietary **SaaS dashboard** for production companies: manage bookings, artists, venues, billing, and payment requests. Built for **אמא הפקות** with the **Spotlight Amber** visual identity (Inter + Assistant typography, Amber/Indigo palette), Hebrew RTL support, role-based access (Admin/Staff), and integration with **Morning (Hashbonit Yeruka)** for invoicing.

---

### Features

| Feature | Description |
|--------|-------------|
| **Bookings** | Table with filter by artist or date; status badges (Pending, Confirmed, Needs Review, Payment Sent). |
| **New booking** | Form: Artist, Date, Venue, Fee, Notes. Submits to Google Sheets via Web App API. |
| **Statistics** | Revenue (₪), total bookings, pending, confirmed, needs review. Admin-only revenue/fee view. |
| **Payment requests** | Morning (Green Invoice) integration; “Send payment request” per booking; anti-duplicate. |
| **Theme** | Light/Dark toggle; **Spotlight Amber** glassmorphism; iOS-style bottom sheet on mobile. |
| **Terms overlay** | First-session Terms of Use acceptance; link to SLA/Terms document. |
| **Offline resilience** | Pending bookings stored locally when offline; sent when connection returns. |

---

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | HTML5, CSS3, JavaScript (vanilla); **Inter** (300–900) & **Assistant** (600) (Google Fonts); Spotlight Amber palette. |
| **Backend** | Google Apps Script (Web App). |
| **Data** | Google Sheets, Google Drive. |
| **Invoicing** | Morning (Hashbonit Yeruka) API. |

- **Dashboard**: Static `index.html`, `app.js`, `styles.css` in the **repository root**. No build step; ready for GitHub Pages or any static host.
- **API**: `GoogleSheetsVersion.gs` deployed as a Google Web App. Endpoints: `whoami`, `data`, `logo`, `artists`; POST: `addBooking`, `sendPaymentRequest`.

---

### Security (Amendment 13 Compliance)

The system supports **Israeli Privacy Protection Law (Amendment 13)** and audit requirements:

| Measure | Implementation |
|--------|----------------|
| **Audit log** | Hidden **LOGS** sheet records: Timestamp, UserEmail, Action, SpreadsheetId. |
| **When logged** | Every Dashboard read (data/logo/whoami) and every write (addBooking, sendPaymentRequest). |
| **Access control** | RBAC via **משתמשים** sheet (Email, Role, Name). Admin: full access; Staff: schedules only, no fee/revenue. |
| **Licensing** | Script runs only when spreadsheet ID matches `AUTHORIZED_SPREADSHEET_ID` (optional lock). |
| **Secrets** | Morning API keys stored in Script Properties; not in source. |

---

### Setup

1. **Google Workspace**
   - Create a Google Sheet → **Extensions → Apps Script**. Paste `GoogleSheetsVersion.gs`.
   - Run **`masterInstallation()`** once. This creates folders, sheets (הזמנות, אמנים, לקוחות, הגדרות, משתמשים), and saves IDs to Script Properties.
   - Set **Script Properties**: `AUTHORIZED_SPREADSHEET_ID` (or leave `YOUR_*` to bypass during setup). Set Morning keys via **`migrateMorningKeysFromSheet()`** or Script Properties.
   - Add users in **משתמשים** (Email, Role, Name). Upload **LOGO** (or LOGO.png) to the root Drive folder.

2. **Deploy Web App**
   - **Deploy → New deployment → Web app**. Execute as: **User accessing**. Who has access: **Anyone with a Google account**. Copy the URL (ends with `/exec`).

3. **Dashboard**
   - In **`index.html`** set `window.DASHBOARD_API_URL` to the Web App URL. Set `window.TERMS_URL` to your SLA/Terms page (or `#` to disable).
   - Host the repo (e.g. GitHub Pages from root). See [DEPLOYMENT.md](DEPLOYMENT.md).

4. **Optional triggers**
   - `installDailyBackupTrigger()` — daily CSV to Drive “Backups”.
   - `installDailySnapshotTrigger()` — daily PDF email to admin.
   - `installSendDailyEmergencyBackupTrigger()` — daily CSV email.

---

### Project Structure

```
├── README.md
├── LICENSE
├── DEPLOYMENT.md
├── .gitignore
├── index.html          # Dashboard entry (root = clean GitHub Pages URL)
├── app.js
├── styles.css
├── GoogleSheetsVersion.gs
├── Dashboard/          # (optional legacy; main app at root)
├── files/
└── Templates.md
```

---

### License

Proprietary. **Spotlight Agency** / **Spotlight Amber** brand. All rights reserved to MODU. See [LICENSE](LICENSE).

---

## עברית

### סקירה

**אמא הפקות** היא מערכת **SaaS** קניינית לחברות הפקה: ניהול הזמנות, אמנים, מקומות, חיוב ושליחת דרישות תשלום. זהות ויזואלית **Spotlight Amber** (Inter, Assistant, פלטת Amber/Indigo). תמיכה ב־RTL, הרשאות (מנהל/צוות) ואינטגרציה עם **מורנינג (חשבונית ירוקה)**.

---

### תכונות

- טבלת הזמנות עם סינון (אמן / תאריך); סטטוסים: ממתין, אושר, נדרש סקירה, דרישת תשלום נשלחה.
- טופס הזמנה חדשה: אמן, תאריך, מקום, סכום, הערות.
- סטטיסטיקות והכנסות (מנהל בלבד); צפייה בצוות ללא סכומים.
- שליחת דרישת תשלום למורנינג; מניעת שליחה כפולה.
- ערכת נושא בהירה/כהה; גיליון תחתון בסגנון iOS.
- אישור תנאי שימוש בסשן הראשון; קישור למסמך SLA/תנאים.
- שמירה מקומית של הזמנות כשהחיבור נופל; שליחה אוטומטית עם החזרת החיבור.

---

### מחסן טכנולוגיות

| שכבת UI / שרת | טכנולוגיה |
|----------------|----------|
| פרונט | HTML5, CSS3, JavaScript; Inter, Assistant; פלטת Spotlight Amber |
| באקאנד | Google Apps Script (Web App) |
| נתונים | Google Sheets, Google Drive |
| חיוב | מורנינג (חשבונית ירוקה) API |

- **דשבורד**: קבצי `index.html`, `app.js`, `styles.css` ב**שורש הפרויקט**. מתאים ל־GitHub Pages.
- **API**: `GoogleSheetsVersion.gs` מפורס כ־Web App.

---

### אבטחה (תאימות לתיקון 13)

| אמצעי | יישום |
|-------|--------|
| **יומן ביקורת** | גיליון נסתר **LOGS**: תאריך, אימייל משתמש, פעולה, מזהה גיליון. |
| **רישום** | בכל טעינת דשבורד (קריאה) ובכל שינוי נתונים (כתיבה). |
| **הרשאות** | גיליון **משתמשים** (אימייל, תפקיד, שם). מנהל: גישה מלאה; צוות: לוח זמנים בלבד. |
| **רישיון** | הסקריפט רץ רק כאשר מזהה הגיליון תואם ל־`AUTHORIZED_SPREADSHEET_ID`. |
| **סודות** | מפתחות מורנינג ב־Script Properties. |

---

### הוראות התקנה

1. **Google Workspace**: צור גיליון → **תוספים → Apps Script** → הדבק `GoogleSheetsVersion.gs` → הרץ **`masterInstallation()`** פעם אחת. הגדר Script Properties ומשתמשים; העלה קובץ **LOGO** לתיקיית השורש.
2. **פריסת Web App**: Deploy → Web app; Execute as: User accessing; העתק את ה־URL (מסתיים ב־`/exec`).
3. **דשבורד**: ב־`index.html` הגדר `DASHBOARD_API_URL` ו־`TERMS_URL`. אחסן את שורש הפרויקט (למשל GitHub Pages). ראה [DEPLOYMENT.md](DEPLOYMENT.md).
4. **טריגרים אופציונליים**: גיבוי יומי ל־Drive, שליחת PDF/CSV למייל.

---

### רישיון

קנייני. מותג **Spotlight Agency** / **Spotlight Amber**. כל הזכויות שמורות ל־MODU. ראה [LICENSE](LICENSE).
