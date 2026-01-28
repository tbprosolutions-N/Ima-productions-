# תבנית בקשת תשלום - Payment Request Template

## הוראות שימוש
1. צור עותק של מסמך זה ב-Google Docs
2. שמור את ה-ID של המסמך (מה-URL)
3. הכנס את ה-ID לקובץ CalendarSync.gs בהגדרות

## תוכן התבנית (העתק ל-Google Doc)

---

[לוגו החברה]

**שיווק שלו - ניהול אמנים**
Artist Booking Agency

---

## בקשת תשלום / Payment Request

**מספר בקשה:** {{INVOICE_NUMBER}}
**תאריך:** {{TODAY}}

---

### פרטי המזמין / Client Details

| | |
|---|---|
| **שם החברה:** | {{CLIENT_NAME_HEB}} |
| **שם באנגלית:** | {{CLIENT_NAME}} |
| **ח.פ / ע.מ:** | {{BUSINESS_NUMBER}} |
| **כתובת:** | {{BILLING_ADDRESS}} |

---

### פרטי האירוע / Event Details

| | |
|---|---|
| **תאריך האירוע:** | {{DATE}} |
| **שם האמן:** | {{ARTIST_NAME}} |
| **מיקום:** | {{VENUE_NAME}} |

---

### פרטי התשלום / Payment Details

| תיאור | סכום |
|---|---:|
| שכר אמן - הופעה חיה | {{FEE}} |
| **סה"כ לתשלום** | **{{FEE}}** |

---

### תנאי תשלום

* תנאי תשלום: {{PAYMENT_TERMS}}
* אמצעי תשלום: העברה בנקאית / צ'ק / כרטיס אשראי

---

### פרטי חשבון בנק

| | |
|---|---|
| **שם החשבון:** | שיווק שלו בע"מ |
| **בנק:** | לאומי (10) |
| **סניף:** | 123 |
| **מספר חשבון:** | 12345678 |

---

**הערות:**
* חשבונית מס תישלח עם קבלת התשלום
* במקרה של איחור בתשלום יתווספו ריבית והצמדה כחוק

---

בברכה,
**שיווק שלו**
טלפון: 050-1234567
אימייל: booking@shivukshelo.co.il

---

## Placeholder Legend

| Placeholder | Description | Example |
|---|---|---|
| `{{INVOICE_NUMBER}}` | Auto-generated invoice number | INV-202502-001 |
| `{{TODAY}}` | Current date | 15/02/2025 |
| `{{DATE}}` | Event date | 20/02/2025 |
| `{{ARTIST_NAME}}` | Artist/band name | The Revivalists |
| `{{CLIENT_NAME}}` | Client legal name (English) | Shelter Events Ltd. |
| `{{CLIENT_NAME_HEB}}` | Client legal name (Hebrew) | שלטר אירועים בע״מ |
| `{{BUSINESS_NUMBER}}` | Business registration number | 51-234567-8 |
| `{{BILLING_ADDRESS}}` | Client billing address | רח׳ הרצל 15, תל אביב |
| `{{VENUE_NAME}}` | Event venue name | Shelter TLV |
| `{{FEE}}` | Formatted fee amount | ₪18,000 |
| `{{PAYMENT_TERMS}}` | Payment terms | Net 30 |

---

## Styling Notes for Google Doc

1. **Font:** Use "Assistant" or "Heebo" for Hebrew support
2. **Colors:** 
   - Primary: #1a1a24 (dark headers)
   - Accent: #6366f1 (links, highlights)
3. **Tables:** Light gray borders, no fill
4. **Logo:** Place at top, centered or right-aligned
5. **Page Size:** A4
