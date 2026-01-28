# Artist-Ops 360 - Database Schema

## Overview
This schema is designed for **Airtable** (recommended) or **Google Sheets**. The relational structure connects Artists, Clients, and Bookings with automated lookups.

---

## 🎤 Table 1: Artists

| Field Name | Type | Description | Example |
|------------|------|-------------|---------|
| `artist_id` | Auto Number | Unique identifier | 1 |
| `name` | Single Line Text | Artist/Band name | "The Revivalists" |
| `email` | Email | Contact email | artist@email.com |
| `phone` | Phone | Contact number | +972-50-123-4567 |
| `manager_name` | Single Line Text | Manager/Agent name | "David Cohen" |
| `manager_email` | Email | Manager contact | manager@email.com |
| `base_price` | Currency (ILS) | Standard booking fee | ₪15,000 |
| `price_notes` | Long Text | Pricing conditions | "Weekend +20%, Holidays +30%" |
| `technical_rider_url` | URL | Link to rider doc | https://drive.google.com/... |
| `artist_logo_url` | URL | Logo for documents | https://drive.google.com/... |
| `genre` | Single Select | Music category | Pop, Rock, Jazz, Electronic |
| `status` | Single Select | Active/Inactive | Active |
| `notes` | Long Text | Internal notes | "Requires green room" |
| `created_at` | Date | Record creation | 2025-01-15 |
| `updated_at` | Date | Last modification | 2025-01-20 |

**Airtable Formula Fields:**
```
total_bookings = COUNT(Bookings.artist_link)
revenue_ytd = SUM(Bookings[fee]) WHERE Year(event_date)=YEAR(TODAY())
```

---

## 🏢 Table 2: Clients

| Field Name | Type | Description | Example |
|------------|------|-------------|---------|
| `client_id` | Auto Number | Unique identifier | 1 |
| `search_keyword` | Single Line Text | **Calendar match term** | "Shelter" |
| `legal_name` | Single Line Text | Full legal entity | "Shelter Events Ltd." |
| `legal_name_hebrew` | Single Line Text | Hebrew legal name | "שלטר אירועים בע״מ" |
| `business_number` | Single Line Text | ח.פ / ע.מ number | 51-234567-8 |
| `vat_id` | Single Line Text | VAT registration | 123456789 |
| `billing_email` | Email | Invoice recipient | billing@shelter.co.il |
| `billing_address` | Long Text | Full address | "רח׳ הרצל 15, תל אביב" |
| `contact_name` | Single Line Text | Primary contact | "Sarah Levi" |
| `contact_phone` | Phone | Contact number | +972-52-987-6543 |
| `payment_terms` | Single Select | Net days | Net 30, Net 45, Net 60, Immediate |
| `default_venue` | Single Line Text | Usual venue name | "Shelter Club TLV" |
| `venue_address` | Long Text | Venue address | "שדרות רוטשילד 30, תל אביב" |
| `venue_capacity` | Number | Max attendance | 500 |
| `notes` | Long Text | Internal notes | "VIP parking required" |
| `status` | Single Select | Relationship status | Active, Prospect, Inactive |
| `created_at` | Date | Record creation | 2025-01-15 |
| `flag_incomplete` | Checkbox | Needs manual review | ☑ |

**Search Keywords Guide:**
The `search_keyword` field is critical for automation. Examples:
- "Shelter" → matches "The Revivalists @ Shelter"
- "Zappa" → matches "Artist @ Zappa Herzliya"
- "Mann" → matches "Artist @ Mann Auditorium"

---

## 📅 Table 3: Bookings

| Field Name | Type | Description | Example |
|------------|------|-------------|---------|
| `booking_id` | Auto Number | Unique identifier | 1 |
| `event_date` | Date | Performance date | 2025-02-14 |
| `event_time` | Single Line Text | Performance time | "21:00" |
| `calendar_event_id` | Single Line Text | Google Calendar ID | abc123xyz |
| `artist_link` | Link to Artists | Related artist | The Revivalists |
| `client_link` | Link to Clients | Related client | Shelter Events Ltd. |
| `venue_name` | Single Line Text | Parsed venue | "Shelter TLV" |
| `venue_address` | Lookup | From Client.venue_address | Auto-filled |
| `fee` | Currency (ILS) | Agreed price | ₪18,000 |
| `deposit_amount` | Currency (ILS) | Upfront payment | ₪9,000 |
| `deposit_paid` | Checkbox | Deposit received | ☑ |
| `deposit_date` | Date | When received | 2025-01-20 |
| `balance_due` | Formula | fee - deposit_amount | ₪9,000 |
| `status` | Single Select | Booking state | See Status Values |
| `payment_status` | Single Select | Financial state | See Payment Status |
| `contract_signed` | Checkbox | Deal memo done | ☑ |
| `contract_date` | Date | Signing date | 2025-01-18 |
| `drive_folder_url` | URL | Event folder | https://drive.google.com/... |
| `payment_request_url` | URL | Invoice PDF | https://drive.google.com/... |
| `deal_memo_url` | URL | Contract PDF | https://drive.google.com/... |
| `notes` | Long Text | Event notes | "Outdoor stage, backup indoor" |
| `created_at` | Date | Record creation | 2025-01-15 |
| `created_by` | Single Line Text | Automation or user | "Calendar Sync" |

**Status Values:**
| Status | Color | Description |
|--------|-------|-------------|
| 🟡 Pending | Yellow | Awaiting confirmation |
| 🟢 Confirmed | Green | Contract signed |
| 🔵 Completed | Blue | Event finished |
| 🔴 Cancelled | Red | Event cancelled |
| ⚪ On Hold | Gray | Temporarily paused |

**Payment Status Values:**
| Status | Color | Description |
|--------|-------|-------------|
| 💰 Paid | Green | Full payment received |
| ⏳ Partial | Yellow | Deposit only |
| 🔴 Overdue | Red | Past due date |
| ⚪ Pending | Gray | Invoice not sent |

---

## 🔗 Relationships Diagram

```
┌─────────────────┐
│    🎤 Artists   │
│   (1 Artist)    │
└────────┬────────┘
         │ 1:N
         ▼
┌─────────────────┐      ┌─────────────────┐
│   📅 Bookings   │◄────►│   🏢 Clients    │
│   (N Bookings)  │ N:1  │   (1 Client)    │
└─────────────────┘      └─────────────────┘
```

---

## 📊 Views (Airtable Interface)

### Dashboard Views

1. **Upcoming Events** (Grid)
   - Filter: `event_date >= TODAY() AND status != "Cancelled"`
   - Sort: `event_date ASC`
   - Group by: `status`

2. **Financial Overview** (Kanban)
   - Group by: `payment_status`
   - Show: `artist_link`, `event_date`, `fee`

3. **Calendar Sync Queue** (Grid)
   - Filter: `flag_incomplete = TRUE`
   - Shows records needing manual completion

4. **Artist Revenue Report** (Pivot)
   - Rows: `artist_link`
   - Values: `SUM(fee)`, `COUNT(booking_id)`
   - Filter: Current year

---

## 🔄 Google Sheets Alternative

If using Google Sheets instead of Airtable:

### Sheet Structure
```
📁 Artist-Ops-360 Spreadsheet
├── 🎤 Artists (Sheet 1)
├── 🏢 Clients (Sheet 2)  
├── 📅 Bookings (Sheet 3)
├── 📊 Dashboard (Sheet 4) - Summary formulas
└── ⚙️ Config (Sheet 5) - Settings & dropdowns
```

### Key Formulas for Google Sheets

**Client Lookup (in Bookings sheet):**
```
=IFERROR(VLOOKUP(REGEXEXTRACT(A2,"@ (.+)$"), Clients!$A:$D, 2, FALSE), "NEW CLIENT")
```

**Artist Lookup:**
```
=IFERROR(VLOOKUP(REGEXEXTRACT(A2,"^(.+) @"), Artists!$A:$B, 2, FALSE), "NEW ARTIST")
```

**Payment Status Color Coding:**
```
=IFS(
  L2="Paid", "🟢",
  L2="Partial", "🟡", 
  L2="Overdue", "🔴",
  TRUE, "⚪"
)
```

---

## 📝 Data Entry Guidelines

### Calendar Event Format
**Required format:** `[Artist Name] @ [Venue Name]`

Examples:
- ✅ `The Revivalists @ Shelter`
- ✅ `DJ Shadow @ Barby TLV`
- ❌ `Show at Shelter` (missing artist)
- ❌ `The Revivalists performance` (missing venue)

### Incomplete Record Handling
When automation creates a record without full client match:
1. `flag_incomplete` is set to `TRUE`
2. Record appears in "Calendar Sync Queue" view
3. Agent manually completes missing fields
4. Agent unchecks `flag_incomplete` when done

---

## 🛡️ Data Validation Rules

### Artists Table
- `name`: Required, unique
- `base_price`: Positive number
- `email`: Valid email format

### Clients Table
- `search_keyword`: Required, unique (case-insensitive)
- `legal_name`: Required
- `business_number`: Format XX-XXXXXX-X

### Bookings Table
- `event_date`: Future date (for new bookings)
- `fee`: Positive number
- `artist_link`: Must reference existing artist
- `client_link`: Must reference existing client (or flagged)
