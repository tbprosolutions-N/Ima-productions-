# 🎵 Artist-Ops 360 - Lean ERP for Artist Booking Agencies

A professional, automated ERP system that transforms Google Calendar workflows into a full-featured CRM/ERP. Eliminates double-entry, automates document generation, and provides a modern SaaS-like experience.

![Dashboard Preview](dashboard/preview.png)

---

## 🌟 Features

### Core Automation
- **📅 Calendar Sync** - Automatically detects new events from Google Calendar
- **🔍 Smart Parsing** - Extracts artist and venue from event titles (`Artist @ Venue`)
- **👥 Client Auto-Complete** - Matches venues to existing clients using keywords
- **📁 Folder Generation** - Creates organized Drive folders for each event
- **📄 Document Generation** - Auto-fills payment requests and deal memos
- **🔄 Bidirectional Sync** - Updates database with Drive folder links

### Dashboard
- **🌙 Modern Dark Theme** - High-end SaaS aesthetic
- **📱 Mobile-First Design** - Fully responsive for field use
- **🎯 Status Badges** - Visual indicators for payment status
- **⚡ Quick Actions** - One-tap access to common tasks
- **🔔 Attention Alerts** - Highlights items requiring action

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Google Calendar                          │
│                   (Source of Truth)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │ Trigger
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  Google Apps Script                          │
│              (Automation Engine)                             │
│  • Parse event title                                         │
│  • Lookup artist/client                                      │
│  • Create Drive folder                                       │
│  • Generate documents                                        │
└──────────┬──────────────────────────┬───────────────────────┘
           │                          │
           ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────────┐
│   Airtable/Sheets    │   │         Google Drive              │
│    (Database)        │   │    (Document Storage)             │
│  • Artists           │   │  • Event folders                  │
│  • Clients           │   │  • Payment requests               │
│  • Bookings          │   │  • Deal memos                     │
└──────────┬───────────┘   │  • Technical riders               │
           │               └──────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────────────┐
│                   Web Dashboard                              │
│             (HTML/CSS/JS Interface)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 Project Structure

```
artist-ops-360/
├── database/
│   └── SCHEMA.md              # Complete database schema
├── scripts/
│   ├── CalendarSync.gs        # Main Google Apps Script (Airtable version)
│   └── GoogleSheetsVersion.gs # Alternative using Google Sheets
├── templates/
│   ├── PAYMENT_REQUEST_TEMPLATE.md
│   └── DEAL_MEMO_TEMPLATE.md
├── dashboard/
│   ├── index.html             # Main dashboard HTML
│   ├── styles.css             # Complete CSS styles
│   └── app.js                 # JavaScript application logic
└── README.md                  # This file
```

---

## 🚀 Quick Start

### Prerequisites

- Google Account with Calendar, Drive, and Apps Script access
- Airtable account (free tier works) OR use Google Sheets
- Basic familiarity with Google Apps Script

### Step 1: Set Up Database

#### Option A: Airtable (Recommended)

1. Create a new Airtable Base
2. Create three tables: **Artists**, **Clients**, **Bookings**
3. Add fields according to `database/SCHEMA.md`
4. Get your API key from Airtable settings
5. Note your Base ID from the URL

#### Option B: Google Sheets

1. Create a new Google Spreadsheet
2. Run `setupSpreadsheet()` from `GoogleSheetsVersion.gs`
3. Note the Spreadsheet ID from the URL

### Step 2: Create Document Templates

1. Open Google Docs
2. Create two documents using the templates in `/templates/`
3. Note the Document IDs from each URL

### Step 3: Create Drive Folder

1. In Google Drive, create a folder called "Artist Bookings"
2. Note the Folder ID from the URL

### Step 4: Deploy Google Apps Script

1. Go to [script.google.com](https://script.google.com)
2. Create a new project
3. Copy contents of `CalendarSync.gs` (or `GoogleSheetsVersion.gs`)
4. Update the `CONFIG` object with your IDs:

```javascript
const CONFIG = {
  AIRTABLE_API_KEY: 'YOUR_API_KEY',
  AIRTABLE_BASE_ID: 'YOUR_BASE_ID',
  CALENDAR_ID: 'primary',
  BOOKINGS_FOLDER_ID: 'YOUR_FOLDER_ID',
  PAYMENT_REQUEST_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  DEAL_MEMO_TEMPLATE_ID: 'YOUR_TEMPLATE_ID'
};
```

5. Run `testConfiguration()` to verify setup
6. Run `createSyncTrigger()` to enable automatic sync

### Step 5: Deploy Dashboard (Optional)

The dashboard can be hosted on:

- **GitHub Pages** (free)
- **Google Sites** (embedded)
- **Netlify/Vercel** (free tier)
- **Your own server**

---

## 📅 Calendar Event Format

Events must follow this format for automatic processing:

```
[Artist Name] @ [Venue Name]
```

**Examples:**
- ✅ `The Revivalists @ Shelter TLV`
- ✅ `DJ Shadow @ Barby Club`
- ✅ `Infected Mushroom @ Expo Tel Aviv`
- ❌ `Show at Shelter` (missing artist)
- ❌ `The Revivalists concert` (missing venue)

---

## 🔧 Configuration Options

### Sync Frequency

Default: Every 15 minutes

To change, modify the trigger in `createSyncTrigger()`:

```javascript
// Every 5 minutes
ScriptApp.newTrigger('syncCalendarToDatabase')
  .timeBased()
  .everyMinutes(5)
  .create();

// Every hour
ScriptApp.newTrigger('syncCalendarToDatabase')
  .timeBased()
  .everyHours(1)
  .create();
```

### Days to Look Ahead

Default: 90 days

```javascript
SYNC_DAYS_AHEAD: 90,  // Change this value
```

### Event Title Pattern

Default: `Artist @ Venue`

```javascript
EVENT_TITLE_PATTERN: /^(.+)\s*@\s*(.+)$/,  // Modify regex if needed
```

---

## 📊 Database Schema Reference

### Artists Table

| Field | Type | Required |
|-------|------|----------|
| name | Text | ✅ |
| email | Email | |
| phone | Phone | |
| base_price | Currency | |
| technical_rider_url | URL | |
| status | Select | ✅ |

### Clients Table

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| search_keyword | Text | ✅ | Used for matching |
| legal_name | Text | ✅ | |
| business_number | Text | | ח.פ / ע.מ |
| billing_email | Email | | |
| payment_terms | Select | | Net 30, Net 45, etc. |

### Bookings Table

| Field | Type | Required |
|-------|------|----------|
| event_date | Date | ✅ |
| artist_link | Link | ✅ |
| client_link | Link | ✅ |
| venue_name | Text | ✅ |
| fee | Currency | |
| status | Select | ✅ |
| drive_folder_url | URL | |

---

## 🎨 Dashboard Customization

### Changing Colors

Edit CSS variables in `styles.css`:

```css
:root {
  --accent-primary: #6366f1;     /* Main brand color */
  --accent-secondary: #8b5cf6;   /* Secondary accent */
  --status-paid: #22c55e;        /* Paid status */
  --status-pending: #f59e0b;     /* Pending status */
  --status-overdue: #ef4444;     /* Overdue status */
}
```

### Light Theme

Add a `.light-theme` class option:

```css
.light-theme {
  --bg-primary: #ffffff;
  --bg-secondary: #f8fafc;
  --bg-card: #ffffff;
  --text-primary: #1e293b;
  --text-secondary: #64748b;
}
```

### Hebrew/RTL Support

Already configured! The HTML includes:
```html
<html lang="he" dir="rtl">
```

Font is set to Heebo for native Hebrew support.

---

## 🔐 Security Best Practices

1. **API Keys** - Never commit API keys to version control
2. **Permissions** - Use minimal required OAuth scopes
3. **Data Access** - Limit Airtable API key to specific bases
4. **Sharing** - Keep Drive folders properly restricted

---

## 🐛 Troubleshooting

### "Calendar not found"
- Ensure `CALENDAR_ID` is correct
- For primary calendar, use `'primary'`
- For other calendars, use the calendar ID from settings

### "Airtable authentication failed"
- Verify API key is valid
- Check Base ID is correct
- Ensure table names match exactly

### "Documents not generating"
- Verify template IDs are correct
- Check template has all placeholders
- Ensure Drive folder permissions allow editing

### "Client not matching"
- Check `search_keyword` field in Clients table
- Keywords are case-insensitive
- Partial matches work (e.g., "Shelter" matches "Shelter TLV")

---

## 📈 Future Enhancements

- [ ] Email notifications for new bookings
- [ ] WhatsApp integration for client communication
- [ ] Financial reporting and analytics
- [ ] Multi-language support
- [ ] Invoice generation with Hebrew/English toggle
- [ ] Recurring booking support
- [ ] Artist availability calendar
- [ ] Client portal for status tracking

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

## 📄 License

MIT License - Feel free to use and modify for your own agency.

---

## 📞 Support

For questions or customization requests:
- Open an issue on GitHub
- Email: support@example.com

---

**Built with ❤️ for Artist Booking Agencies**
