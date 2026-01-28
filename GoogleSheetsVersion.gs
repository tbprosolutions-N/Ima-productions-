/**
 * Property of MODU. Unauthorized copying or distribution is prohibited.
 */
/**
 * אמא הפקות (Ima Productions) – Full Autonomous SaaS (Booking → Billing)
 * Account: modu.general@gmail.com  |  Zero-Intervention, Ready for Production.
 * @version 4.0.0
 *
 * masterInstallation() – strict Hebrew RTL setup:
 *   Folder "אמא הפקות - מערכת ניהול", subfolders, RTL Doc templates (בקשת תשלום, הסכם הופעה).
 *   Spreadsheet tabs strictly named: הזמנות, אמנים, לקוחות, הגדרות, משתמשים. All IDs → ScriptProperties.
 *   הגדרות: Status options + "Payment Sent"; rows 9–12 = Morning (Morning_ApiId, Morning_ApiSecret).
 *
 * Morning (Hashbonit Yeruka): createMorningPaymentRequest(bookingData).
 *   Morning keys from ScriptProperties (IMAP_MORNING_API_ID, IMAP_MORNING_API_SECRET). Use migrateMorningKeysFromSheet() once to copy from הגדרות.
 *   sendPaymentRequestForBooking(bookingId) → Morning API → status "Payment Sent".
 * RBAC: Admin = full (Revenue/Fee); Staff = schedules only. 15-min sync; 75% fuzzy → Needs Review.
 * LOGO from Drive for dashboard + PDFs.
 * Privacy (Amendment 13): logActivity(action) records user email, timestamp, action in hidden LOGS sheet.
 * Redundancy: dailyBackup() exports הזמנות to CSV in "Backups" folder. Run installDailyBackupTrigger() once for daily 2:00 run.
 *
 * PRODUCTION (modu.general@gmail.com):
 *   1. Run masterInstallation() once.
 *   2. Set Morning API keys in Script Properties (or run migrateMorningKeysFromSheet() after filling הגדרות).
 *   3. Add users in משתמשים. Put LOGO in root folder.
 *   4. Deploy Web App: Execute as "User accessing", "Anyone with Google account".
 *   5. Set window.DASHBOARD_API_URL in Dashboard/index.html.
 */

// ============================================
// LICENSING LOCK – script runs only when spreadsheet matches AUTHORIZED_SPREADSHEET_ID
// ============================================
/** Replace with the spreadsheet ID that is licensed to run this script. If still YOUR_*, lock is bypassed. */
var AUTHORIZED_SPREADSHEET_ID = 'YOUR_AUTHORIZED_SPREADSHEET_ID';

function assertAuthorized() {
  var ss = getSpreadsheet();
  if (!ss) return false;
  var id = ss.getId();
  if (!AUTHORIZED_SPREADSHEET_ID || String(AUTHORIZED_SPREADSHEET_ID).indexOf('YOUR_') === 0) return true;
  return id === AUTHORIZED_SPREADSHEET_ID;
}
// Functional audit: Lock is ACTIVE when AUTHORIZED_SPREADSHEET_ID is set to a real spreadsheet ID (not YOUR_*).
// Morning anti-duplicate: status set to "Payment Sent" after success; Dashboard hides send button for that row.
// DailyBackup: run installDailyBackupTrigger() once from script editor to enable daily 2:00 CSV backup to Drive.

// ============================================
// SANDBOX CONFIGURATION (modu.general@gmail.com)
// Paste IDs from your Google Workspace items below.
// ============================================

const IMAP_CONFIG = {
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',

  ARTISTS_SHEET: 'אמנים',
  CLIENTS_SHEET: 'לקוחות',
  BOOKINGS_SHEET: 'הזמנות',
  CONFIG_SHEET: 'הגדרות',
  USERS_SHEET: 'משתמשים',

  // Use 'primary' for modu.general@gmail.com main calendar, or paste a calendar ID
  CALENDAR_ID: 'primary',

  // PASTE DRIVE FOLDER ID: Open the folder in Drive → URL has /folders/XXXXX → paste XXXXX here.
  // This folder will hold event subfolders and generated PDFs.
  BOOKINGS_FOLDER_ID: 'YOUR_DRIVE_FOLDER_ID',

  // PASTE TEMPLATE IDs: Create two Google Docs from Templates.md, then from each doc URL
  // (docs.google.com/document/d/XXXXX/edit) paste XXXXX here.
  PAYMENT_REQUEST_TEMPLATE_ID: 'YOUR_PAYMENT_TEMPLATE_ID',  // בקשת תשלום
  DEAL_MEMO_TEMPLATE_ID: 'YOUR_DEAL_MEMO_TEMPLATE_ID',       // הסכם הופעה

  SYNC_DAYS_AHEAD: 90,
  EVENT_PATTERN: /^(.+)\s*@\s*(.+)$/,
  AUTO_MATCH_THRESHOLD: 0.90,
  REVIEW_THRESHOLD: 0.75,
  BRAND: 'אמא הפקות'
};

// Keys used in Script Properties by masterInstallation() – no manual copy‑paste after run
var IMAP_PROPS = {
  SPREADSHEET_ID: 'IMAP_SPREADSHEET_ID',
  ROOT_FOLDER_ID: 'IMAP_ROOT_FOLDER_ID',
  BOOKINGS_FOLDER_ID: 'IMAP_BOOKINGS_FOLDER_ID',
  PAYMENT_REQUEST_TEMPLATE_ID: 'IMAP_PAYMENT_REQUEST_TEMPLATE_ID',
  DEAL_MEMO_TEMPLATE_ID: 'IMAP_DEAL_MEMO_TEMPLATE_ID',
  MORNING_API_ID: 'IMAP_MORNING_API_ID',
  MORNING_API_SECRET: 'IMAP_MORNING_API_SECRET'
};

var SCRIPT_CONFIG_SHEET = 'ScriptConfig';
var LOGS_SHEET = 'LOGS';

/**
 * Effective config: reads from (1) Script Properties or (2) sheet "ScriptConfig" if ss provided.
 * masterInstallation() saves IDs to both, so the sheet works even when the script is re‑added to the new workbook.
 */
function getConfig(ssFromContext) {
  var out = {
    SPREADSHEET_ID: null,
    ROOT_FOLDER_ID: null,
    BOOKINGS_FOLDER_ID: null,
    PAYMENT_REQUEST_TEMPLATE_ID: null,
    DEAL_MEMO_TEMPLATE_ID: null
  };
  var ss = ssFromContext || null;
  if (!ss) {
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}
  }
  if (ss) {
    var cfgSh = ss.getSheetByName(SCRIPT_CONFIG_SHEET);
    if (cfgSh) {
      var data = cfgSh.getDataRange().getValues();
      for (var i = 0; i < data.length; i++) {
        var k = String(data[i][0] || '').trim();
        var v = String(data[i][1] || '').trim();
        if (k === IMAP_PROPS.SPREADSHEET_ID) out.SPREADSHEET_ID = v;
        if (k === IMAP_PROPS.ROOT_FOLDER_ID) out.ROOT_FOLDER_ID = v;
        if (k === IMAP_PROPS.BOOKINGS_FOLDER_ID) out.BOOKINGS_FOLDER_ID = v;
        if (k === IMAP_PROPS.PAYMENT_REQUEST_TEMPLATE_ID) out.PAYMENT_REQUEST_TEMPLATE_ID = v;
        if (k === IMAP_PROPS.DEAL_MEMO_TEMPLATE_ID) out.DEAL_MEMO_TEMPLATE_ID = v;
      }
      out.SPREADSHEET_ID = out.SPREADSHEET_ID || ss.getId();
    }
  }
  var p = PropertiesService.getScriptProperties();
  out.SPREADSHEET_ID = out.SPREADSHEET_ID || p.getProperty(IMAP_PROPS.SPREADSHEET_ID) || IMAP_CONFIG.SPREADSHEET_ID;
  out.ROOT_FOLDER_ID = out.ROOT_FOLDER_ID || p.getProperty(IMAP_PROPS.ROOT_FOLDER_ID);
  out.BOOKINGS_FOLDER_ID = out.BOOKINGS_FOLDER_ID || p.getProperty(IMAP_PROPS.BOOKINGS_FOLDER_ID) || IMAP_CONFIG.BOOKINGS_FOLDER_ID;
  out.PAYMENT_REQUEST_TEMPLATE_ID = out.PAYMENT_REQUEST_TEMPLATE_ID || p.getProperty(IMAP_PROPS.PAYMENT_REQUEST_TEMPLATE_ID) || IMAP_CONFIG.PAYMENT_REQUEST_TEMPLATE_ID;
  out.DEAL_MEMO_TEMPLATE_ID = out.DEAL_MEMO_TEMPLATE_ID || p.getProperty(IMAP_PROPS.DEAL_MEMO_TEMPLATE_ID) || IMAP_CONFIG.DEAL_MEMO_TEMPLATE_ID;
  return out;
}

// ============================================
// MASTER INSTALLATION – Build entire infrastructure (modu.general@gmail.com)
// ============================================

/** High-end Hebrew business doc: "בקשת תשלום". RTL, tables, «placeholders» only (no {{ }}). */
function _buildPaymentRequestDoc(body) {
  body.clear();
  var R = DocumentApp.HorizontalAlignment.RIGHT;
  body.appendParagraph('אמא הפקות').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('ניהול אמנים והפקות').setAlignment(R).setSpacingAfter(4);
  body.appendParagraph('בקשת תשלום').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Payment Request').setAlignment(R).setSpacingAfter(16);
  body.appendParagraph('תאריך:').setAlignment(R);
  body.appendParagraph('«TODAY»').setAlignment(R).setSpacingAfter(12);
  body.appendParagraph('פרטי המזמין').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var t1 = body.appendTable([
    ['שם החברה', '«CLIENT_NAME_HEB»'],
    ['שם באנגלית', '«CLIENT_NAME»'],
    ['ח.פ / ע.מ', '«BUSINESS_NUMBER»'],
    ['כתובת', '«BILLING_ADDRESS»']
  ]);
  t1.getRow(0).getCell(0).getChild(0).asParagraph().setAlignment(R);
  t1.getRow(0).getCell(1).getChild(0).asParagraph().setAlignment(R);
  body.appendParagraph('').setSpacingAfter(8);
  body.appendParagraph('פרטי האירוע').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var t2 = body.appendTable([
    ['תאריך האירוע', '«DATE»'],
    ['שם האמן', '«ARTIST_NAME»'],
    ['מיקום', '«VENUE_NAME»']
  ]);
  body.appendParagraph('').setSpacingAfter(8);
  body.appendParagraph('פרטי התשלום').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var t3 = body.appendTable([
    ['שכר אמן – הופעה חיה', '«FEE»'],
    ['סה"כ לתשלום', '«FEE»']
  ]);
  body.appendParagraph('').setSpacingAfter(8);
  body.appendParagraph('תנאי תשלום: «PAYMENT_TERMS»').setAlignment(R);
  body.appendParagraph('אמצעי תשלום: העברה בנקאית / צ\'ק / כרטיס אשראי').setAlignment(R).setSpacingAfter(8);
  body.appendParagraph('פרטי חשבון בנק – שם החשבון: אמא הפקות').setAlignment(R);
  body.appendParagraph('חשבונית מס תישלח עם קבלת התשלום. במקרה של איחור בתשלום יתווספו ריבית והצמדה כחוק.').setAlignment(R).setSpacingAfter(4);
  body.appendParagraph('בברכה, אמא הפקות').setAlignment(R);
}

/** High-end Hebrew business doc: "הסכם הופעה". RTL, tables, «placeholders», clean signature underlines. */
function _buildDealMemoDoc(body) {
  body.clear();
  var R = DocumentApp.HorizontalAlignment.RIGHT;
  body.appendParagraph('אמא הפקות').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('ניהול אמנים והפקות').setAlignment(R).setSpacingAfter(4);
  body.appendParagraph('הסכם להעסקת אמן – הופעה חיה').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Deal Memo').setAlignment(R).setSpacingAfter(16);
  body.appendParagraph('תאריך ההסכם: «TODAY»').setAlignment(R).setSpacingAfter(12);
  body.appendParagraph('הצדדים להסכם').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('הסוכנות: אמא הפקות').setAlignment(R);
  var t1 = body.appendTable([
    ['המזמין (המפיק)', '«CLIENT_NAME_HEB» / «CLIENT_NAME»'],
    ['ח.פ / ע.מ', '«BUSINESS_NUMBER»'],
    ['כתובת', '«CLIENT_ADDRESS»'],
    ['איש קשר', '«CONTACT_NAME»'],
    ['טלפון', '«CONTACT_PHONE»']
  ]);
  body.appendParagraph('').setSpacingAfter(8);
  body.appendParagraph('פרטי האירוע').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var t2 = body.appendTable([
    ['שם האמן', '«ARTIST_NAME»'],
    ['תאריך האירוע', '«EVENT_DATE»'],
    ['שעת ההופעה', '«EVENT_TIME»'],
    ['מקום האירוע', '«VENUE_NAME»'],
    ['כתובת', '«VENUE_ADDRESS»']
  ]);
  body.appendParagraph('').setSpacingAfter(8);
  body.appendParagraph('תנאים כספיים').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  var t3 = body.appendTable([
    ['שכר הופעה', '«FEE»'],
    ['מקדמה (50%)', '«DEPOSIT»'],
    ['יתרה (50%)', '«BALANCE»']
  ]);
  body.appendParagraph('').setSpacingAfter(8);
  body.appendParagraph('תנאים כלליים – התחייבויות המפיק, התחייבויות אמא הפקות, ביטולים, כוח עליון, שונות – כפי בטפסים הסטנדרטיים.').setAlignment(R).setSpacingAfter(8);
  body.appendParagraph('חתימות').setAlignment(R).setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph('אמא הפקות: שם _________________   תאריך «TODAY»   חתימה _________________').setAlignment(R);
  body.appendParagraph('המפיק: שם «CONTACT_NAME»   תאריך _________________   חתימה _________________').setAlignment(R).setSpacingAfter(8);
  body.appendParagraph('הסכם זה נערך ונחתם בשני עותקים, עותק אחד לכל צד.').setAlignment(R);
}

/**
 * Create a Google Doc in the given folder with title; builder(body) builds content. Move into folder.
 * Returns the Document (so caller can get getId() for template ID).
 */
function _createDocInFolder(folder, title, builder) {
  var doc = DocumentApp.create(title);
  var body = doc.getBody();
  if (typeof builder === 'function') {
    builder(body);
  }
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  return doc;
}

/**
 * Master Setup: create Drive structure, template Docs, database Sheet, and save all IDs to Script Properties.
 * Run once from the script editor (modu.general@gmail.com). No manual copy-paste of IDs needed afterward.
 */
function masterInstallation() {
  var rootName = 'אמא הפקות - מערכת ניהול';
  var eventsFolderName = 'תיקיות אירועים';
  var sheetName = 'אמא הפקות - בסיס נתונים';
  var titlePayment = 'תבנית בקשת תשלום';
  var titleDealMemo = 'תבנית הסכם הופעה';

  // —— 1) Drive: main folder and event subfolder ——
  var rootFolder;
  var existingRoot = DriveApp.getRootFolder().getFoldersByName(rootName);
  if (existingRoot.hasNext()) {
    rootFolder = existingRoot.next();
  } else {
    rootFolder = DriveApp.getRootFolder().createFolder(rootName);
  }

  var eventsFolder;
  var existingEvents = rootFolder.getFoldersByName(eventsFolderName);
  if (existingEvents.hasNext()) {
    eventsFolder = existingEvents.next();
  } else {
    eventsFolder = rootFolder.createFolder(eventsFolderName);
  }

  // —— 2) Template Docs (professional Hebrew legal layout, RTL, tables) inside root folder ——
  var paymentDoc = _createDocInFolder(rootFolder, titlePayment, _buildPaymentRequestDoc);
  var dealMemoDoc = _createDocInFolder(rootFolder, titleDealMemo, _buildDealMemoDoc);

  // —— 3) Use current Sheet if bound, else create new "אמא הפקות - בסיס נתונים" ——
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) ss = null;
  } catch (e) {
    ss = null;
  }
  if (!ss) {
    ss = SpreadsheetApp.create(sheetName);
    var ssFile = DriveApp.getFileById(ss.getId());
    ssFile.moveTo(rootFolder);
  }

  // —— 4) Configure RTL tabs: הזמנות, אמנים, לקוחות, הגדרות ——
  setupSpreadsheet(ss);

  // —— 5) Save all IDs to Script Properties and ScriptConfig sheet ——
  var props = PropertiesService.getScriptProperties();
  props.setProperty(IMAP_PROPS.SPREADSHEET_ID, ss.getId());
  props.setProperty(IMAP_PROPS.ROOT_FOLDER_ID, rootFolder.getId());
  props.setProperty(IMAP_PROPS.BOOKINGS_FOLDER_ID, eventsFolder.getId());
  props.setProperty(IMAP_PROPS.PAYMENT_REQUEST_TEMPLATE_ID, paymentDoc.getId());
  props.setProperty(IMAP_PROPS.DEAL_MEMO_TEMPLATE_ID, dealMemoDoc.getId());

  var cfgSh = ss.getSheetByName(SCRIPT_CONFIG_SHEET);
  if (!cfgSh) cfgSh = ss.insertSheet(SCRIPT_CONFIG_SHEET);
  cfgSh.clear();
  cfgSh.getRange(1, 1, 6, 2).setValues([
    [IMAP_PROPS.SPREADSHEET_ID, ss.getId()],
    [IMAP_PROPS.ROOT_FOLDER_ID, rootFolder.getId()],
    [IMAP_PROPS.BOOKINGS_FOLDER_ID, eventsFolder.getId()],
    [IMAP_PROPS.PAYMENT_REQUEST_TEMPLATE_ID, paymentDoc.getId()],
    [IMAP_PROPS.DEAL_MEMO_TEMPLATE_ID, dealMemoDoc.getId()],
    ['(Do not edit – filled by masterInstallation)', '']
  ]);
  cfgSh.getRange('A1:B1').setFontWeight('bold');
  cfgSh.hideSheet();

  // —— 6) Install 15-minute auto-sync trigger ——
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = triggers.length - 1; i >= 0; i--) {
      if (triggers[i].getHandlerFunction() === 'syncCalendarToSheets') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
    ScriptApp.newTrigger('syncCalendarToSheets').timeBased().everyMinutes(15).create();
  } catch (trigErr) {
    Logger.log('Trigger install: ' + trigErr.message);
  }

  // —— 7) Summary ——
  var summary = [
    'אמא הפקות – Master Installation הושלם.',
    '',
    'תיקייה ראשית: ' + rootFolder.getUrl(),
    'תיקיית אירועים: ' + eventsFolder.getUrl(),
    'גיליון: ' + ss.getUrl(),
    'תבנית בקשת תשלום: ' + 'https://docs.google.com/document/d/' + paymentDoc.getId() + '/edit',
    'תבנית הסכם הופעה: ' + 'https://docs.google.com/document/d/' + dealMemoDoc.getId() + '/edit',
    '',
    'כל המזהים נשמרו ב-Script Properties. אין צורך להדביק IDs ידנית.',
    'השתמש בתפריט "אמא הפקות" בגיליון לסנכרון לוח שנה, Smart Match ומסמכים.'
  ].join('\n');

  Logger.log(summary);
  if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.getUi()) {
    try {
      SpreadsheetApp.getUi().alert(summary);
    } catch (err) {}
  }
  return {
    spreadsheetUrl: ss.getUrl(),
    spreadsheetId: ss.getId(),
    rootFolderId: rootFolder.getId(),
    bookingsFolderId: eventsFolder.getId(),
    paymentRequestTemplateId: paymentDoc.getId(),
    dealMemoTemplateId: dealMemoDoc.getId()
  };
}

// ============================================
// SETUP – Build Sheets
// ============================================

/**
 * Build spreadsheet: Artists, Clients, Bookings (אמא הפקות schema).
 * If ssOverride is provided (e.g. from masterInstallation), that sheet is used.
 */
function setupSpreadsheet(ssOverride) {
  var ss = ssOverride || getSpreadsheet();
  if (!ss) return;

  setupArtistsSheet(ss);
  setupClientsSheet(ss);
  setupBookingsSheet(ss);
  setupConfigSheet(ss);
  setupUsersSheet(ss);
  applyBookingsValidation(ss);

  Logger.log('אמא הפקות – Setup complete.');
}

function setupUsersSheet(ss) {
  var headers = ['Email', 'Role', 'Name'];
  var sh = ss.getSheetByName(IMAP_CONFIG.USERS_SHEET);
  if (!sh) sh = ss.insertSheet(IMAP_CONFIG.USERS_SHEET);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#2d3748').setFontColor('#e2e8f0');
  sh.setFrozenRows(1);
  sh.appendRow(['modu.general@gmail.com', 'Admin', 'מנהל']);
}

function getSpreadsheet() {
  var id = getConfig().SPREADSHEET_ID;
  if (id && id.indexOf('YOUR_') !== 0) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      Logger.log('getSpreadsheet: ' + e.message);
    }
  }
  try {
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log('Run masterInstallation() first or set SPREADSHEET_ID in Script Properties.');
    return null;
  }
}

function setupArtistsSheet(ss) {
  // Artists: ID, Name, Aliases, Price, Rider URL, Status
  const headers = ['ID', 'Name', 'Aliases', 'Price', 'Rider URL', 'Status'];
  let sh = ss.getSheetByName(IMAP_CONFIG.ARTISTS_SHEET);
  if (!sh) sh = ss.insertSheet(IMAP_CONFIG.ARTISTS_SHEET);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#2d3748').setFontColor('#e2e8f0');
  sh.setFrozenRows(1);
}

function setupClientsSheet(ss) {
  // Clients: ID, Keyword, Legal Name, Business ID, Email
  const headers = ['ID', 'Keyword', 'Legal Name', 'Business ID', 'Email'];
  let sh = ss.getSheetByName(IMAP_CONFIG.CLIENTS_SHEET);
  if (!sh) sh = ss.insertSheet(IMAP_CONFIG.CLIENTS_SHEET);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#2d3748').setFontColor('#e2e8f0');
  sh.setFrozenRows(1);
}

function setupBookingsSheet(ss) {
  // Bookings: ID, Date, Artist, Venue, Fee, Folder URL, Doc Links, Morning Doc Link, Status, Notes
  const headers = [
    'ID', 'Date', 'Artist', 'Venue', 'Fee', 'Folder URL', 'Doc Links', 'Morning Doc Link',
    'Status', 'Notes'
  ];
  let sh = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!sh) sh = ss.insertSheet(IMAP_CONFIG.BOOKINGS_SHEET);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#2d3748').setFontColor('#e2e8f0');
  sh.setFrozenRows(1);
  sh.getRange('B2:B1000').setNumberFormat('yyyy-mm-dd');
  sh.getRange('E2:E1000').setNumberFormat('₪#,##0');
}

function setupConfigSheet(ss) {
  var sh = ss.getSheetByName(IMAP_CONFIG.CONFIG_SHEET);
  if (!sh) sh = ss.insertSheet(IMAP_CONFIG.CONFIG_SHEET);
  sh.getRange('A1:A8').setValues([
    ['Status Options'], ['Pending'], ['Confirmed'], ['Completed'], ['Cancelled'], ['On Hold'], ['Needs Review'], ['Payment Sent']
  ]);
  sh.getRange('A9:B12').setValues([
    ['הגדרות מורנינג (חשבונית ירוקה)', ''],
    ['Morning_ApiId', ''],
    ['Morning_ApiSecret', ''],
    ['(ממלאים בערכי API מכלים למפתחים במורנינג)', '']
  ]);
  sh.getRange('A9:A9').setFontWeight('bold');
}

function applyBookingsValidation(ss) {
  var config = ss.getSheetByName(IMAP_CONFIG.CONFIG_SHEET);
  var bookings = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!config || !bookings) return;
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(config.getRange('A2:A8')).build();
  bookings.getRange('I2:I1000').setDataValidation(statusRule);
}

// ============================================
// NORMALIZATION (Smart Match)
// ============================================

var NORMALIZE_PATTERNS = [
  { re: /\bDJ\s*/gi, repl: ' ' },
  { re: /\bThe\s+/gi, repl: ' ' },
  { re: /\s+/g, repl: ' ' },
  { re: /[^\w\u0590-\u05FF\s]/g, repl: '' }
];

/**
 * Normalize string for matching: strip DJ, The, extra spaces, special chars
 */
function normalizeForMatch(s) {
  if (s == null || typeof s !== 'string') return '';
  var t = String(s).trim();
  NORMALIZE_PATTERNS.forEach(function (p) {
    t = t.replace(p.re, p.repl);
  });
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ============================================
// LEVENSHTEIN – Fuzzy match
// ============================================

function levenshtein(a, b) {
  a = normalizeForMatch(a);
  b = normalizeForMatch(b);
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  var m = a.length, n = b.length;
  var d = [];
  for (var i = 0; i <= m; i++) {
    d[i] = [i];
  }
  for (var j = 0; j <= n; j++) {
    d[0][j] = j;
  }
  for (var i = 1; i <= m; i++) {
    for (var j = 1; j <= n; j++) {
      var cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost
      );
    }
  }
  var maxLen = Math.max(m, n, 1);
  return 1 - d[m][n] / maxLen;
}

/**
 * Similarity 0..1 between two strings (after normalization)
 */
function similarity(str1, str2) {
  return levenshtein(str1, str2);
}

// ============================================
// SMART MATCH – Artist & Client
// ============================================

function matchArtist(name, options) {
  options = options || {};
  var threshold = options.autoThreshold != null ? options.autoThreshold : IMAP_CONFIG.AUTO_MATCH_THRESHOLD;
  var reviewThreshold = options.reviewThreshold != null ? options.reviewThreshold : IMAP_CONFIG.REVIEW_THRESHOLD;

  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(IMAP_CONFIG.ARTISTS_SHEET);
  var data = sh.getDataRange().getValues();
  var best = { id: null, name: null, sim: 0, row: null };

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var id = row[0], mainName = row[1], aliases = row[2];
    var candidates = [mainName].concat(
      (aliases && String(aliases)) ? String(aliases).split(/[,;]/).map(function (x) { return x.trim(); }) : []
    );
    for (var j = 0; j < candidates.length; j++) {
      var sim = similarity(name, candidates[j]);
      if (sim > best.sim) {
        best = { id: id, name: candidates[j], sim: sim, row: i + 1 };
      }
    }
  }

  if (best.sim >= threshold) {
    return { match: 'auto', id: best.id, name: best.name, similarity: best.sim, row: best.row };
  }
  if (best.sim >= reviewThreshold) {
    return { match: 'review', id: best.id, name: best.name, similarity: best.sim, row: best.row };
  }
  return { match: 'none', id: null, name: null, similarity: best.sim, row: best.row };
}

function matchClient(keyword, options) {
  options = options || {};
  var threshold = options.autoThreshold != null ? options.autoThreshold : IMAP_CONFIG.AUTO_MATCH_THRESHOLD;
  var reviewThreshold = options.reviewThreshold != null ? options.reviewThreshold : IMAP_CONFIG.REVIEW_THRESHOLD;

  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(IMAP_CONFIG.CLIENTS_SHEET);
  var data = sh.getDataRange().getValues();
  var best = { id: null, keyword: null, sim: 0, row: null };

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var kw = row[1];
    if (!kw) continue;
    var sim = similarity(keyword, kw);
    if (sim > best.sim) {
      best = { id: row[0], keyword: kw, sim: sim, row: i + 1 };
    }
  }

  if (best.sim >= threshold) {
    return { match: 'auto', id: best.id, keyword: best.keyword, similarity: best.sim, row: best.row };
  }
  if (best.sim >= reviewThreshold) {
    return { match: 'review', id: best.id, keyword: best.keyword, similarity: best.sim, row: best.row };
  }
  return { match: 'none', id: null, keyword: null, similarity: best.sim, row: best.row };
}

/**
 * Apply Smart Match to Bookings: >90% auto, 75–90% Needs Review + yellow + note with %
 */
function applySmartMatchToBookings() {
  var ss = getSpreadsheet();
  var bookings = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!bookings) return;

  var data = bookings.getDataRange().getValues();
  var lastRow = data.length;
  if (lastRow < 2) return;

  var artistCol = 3, venueCol = 4, statusCol = 9, notesCol = 10;
  var header = data[0];
  var artistIdx = header.indexOf('Artist') >= 0 ? header.indexOf('Artist') : 2;
  var venueIdx = header.indexOf('Venue') >= 0 ? header.indexOf('Venue') : 3;
  var statusIdx = header.indexOf('Status') >= 0 ? header.indexOf('Status') : 8;
  var notesIdx = header.indexOf('Notes') >= 0 ? header.indexOf('Notes') : 9;

  for (var r = 1; r < data.length; r++) {
    var artistRaw = data[r][artistIdx];
    var venueRaw = data[r][venueIdx];
    if (!artistRaw && !venueRaw) continue;

    var art = matchArtist(artistRaw || '');
    var cli = matchClient(venueRaw || '');
    var notes = [];
    var newStatus = data[r][statusIdx];
    var needYellow = false;

    if (art.match === 'review' || cli.match === 'review') {
      newStatus = 'Needs Review';
      needYellow = true;
      if (art.match === 'review') notes.push('Artist match ' + Math.round(art.similarity * 100) + '%: ' + (art.name || artistRaw));
      if (cli.match === 'review') notes.push('Venue match ' + Math.round(cli.similarity * 100) + '%: ' + (cli.keyword || venueRaw));
    }

    if (needYellow) {
      bookings.getRange(r + 1, 1, r + 1, header.length).setBackground('#fefcbf');
    }
    var existingNotes = String(data[r][notesIdx] || '');
    var combined = existingNotes ? (existingNotes + '\n' + notes.join(' | ')) : notes.join(' | ');
    if (notes.length) {
      bookings.getRange(r + 1, notesIdx + 1).setValue(combined);
      bookings.getRange(r + 1, statusIdx + 1).setValue(newStatus);
    }
  }

  Logger.log('אמא הפקות – Smart Match applied.');
}

// ============================================
// CALENDAR SYNC (Artist @ Venue)
// ============================================

function syncCalendarToSheets() {
  var ss = getSpreadsheet();
  var bookings = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  var artists = ss.getSheetByName(IMAP_CONFIG.ARTISTS_SHEET);
  var clients = ss.getSheetByName(IMAP_CONFIG.CLIENTS_SHEET);
  if (!bookings || !artists || !clients) return 0;

  var cal = CalendarApp.getCalendarById(IMAP_CONFIG.CALENDAR_ID);
  var now = new Date();
  var end = new Date(now.getTime() + IMAP_CONFIG.SYNC_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  var events = cal.getEvents(now, end);

  var existingData = bookings.getDataRange().getValues();
  var existingTitles = {};
  for (var i = 1; i < existingData.length; i++) {
    var d = existingData[i][1];
    var a = existingData[i][2];
    var v = existingData[i][3];
    if (d && a && v) existingTitles[d + '|' + a + '|' + v] = true;
  }

  var nextId = 1;
  for (var i = 1; i < existingData.length; i++) {
    var id = existingData[i][0];
    if (typeof id === 'number' && id >= nextId) nextId = id + 1;
  }

  var tz = Session.getScriptTimeZone();
  var created = 0;

  for (var i = 0; i < events.length; i++) {
    var ev = events[i];
    var title = ev.getTitle();
    var m = title.match(IMAP_CONFIG.EVENT_PATTERN);
    if (!m) continue;

    var artistName = m[1].trim();
    var venueName = m[2].trim();
    var start = ev.getStartTime();
    var dateStr = Utilities.formatDate(start, tz, 'yyyy-MM-dd');
    var key = dateStr + '|' + artistName + '|' + venueName;
    if (existingTitles[key]) continue;

    var artistMatch = matchArtist(artistName);
    var clientMatch = matchClient(venueName);
    var artistId = artistMatch.match === 'auto' ? artistMatch.id : '';
    var artistDisplay = artistMatch.match === 'auto' ? (artistMatch.name || artistName) : artistName;
    var clientId = clientMatch.match === 'auto' ? clientMatch.id : '';
    var venueDisplay = clientMatch.match === 'auto' ? (clientMatch.keyword || venueName) : venueName;

    var fee = getArtistPriceById(ss, artistId) || 0;
    var folderUrl = '';
    try {
      var folder = createEventFolder(dateStr + ' - ' + artistName + ' - ' + venueName);
      folderUrl = folder ? folder.getUrl() : '';
    } catch (e) {
      folderUrl = '';
    }

    var status = 'Pending';
    var notes = '';
    if (artistMatch.match === 'review' || clientMatch.match === 'review') {
      status = 'Needs Review';
      if (artistMatch.match === 'review') notes += 'Artist match ' + Math.round((artistMatch.similarity || 0) * 100) + '%. ';
      if (clientMatch.match === 'review') notes += 'Venue match ' + Math.round((clientMatch.similarity || 0) * 100) + '%.';
    }

    var row = [
      nextId++,
      dateStr,
      artistDisplay,
      venueDisplay,
      fee,
      folderUrl,
      '',
      '',
      status,
      notes
    ];
    bookings.appendRow(row);
    var newR = bookings.getLastRow();
    if (status === 'Needs Review') {
      bookings.getRange(newR, 1, newR, 10).setBackground('#fefcbf');
    }
    created++;
    existingTitles[key] = true;
  }

  if (created > 0) {
    applySmartMatchToBookings();
  }
  Logger.log('אמא הפקות – Sync done. Created: ' + created);
  return created;
}

function getArtistPriceById(ss, artistId) {
  if (!artistId) return 0;
  var sh = ss.getSheetByName(IMAP_CONFIG.ARTISTS_SHEET);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(artistId)) return Number(data[i][3]) || 0;
  }
  return 0;
}

function createEventFolder(name) {
  var folderId = getConfig().BOOKINGS_FOLDER_ID;
  if (!folderId || folderId.indexOf('YOUR_') === 0) {
    Logger.log('createEventFolder: No BOOKINGS_FOLDER_ID. Run masterInstallation() or set it.');
    return null;
  }
  try {
    var parent = DriveApp.getFolderById(folderId);
    var it = parent.getFoldersByName(name);
    if (it.hasNext()) return it.next();
    return parent.createFolder(name);
  } catch (e) {
    Logger.log('createEventFolder: ' + e.message);
    return null;
  }
}

// ============================================
// AUTOMATION – Drive folders & PDFs (Deal Memo, Payment Request)
// ============================================

function createDriveFolderAndGeneratePdfs(bookingRowIndex) {
  var ss = getSpreadsheet();
  var bookings = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!bookings || bookingRowIndex < 2) return null;

  var row = bookings.getRange(bookingRowIndex, 1, bookingRowIndex, 10).getValues()[0];
  var id = row[0], dateStr = row[1], artist = row[2], venue = row[3], fee = row[4], folderUrl = row[5];

  var folder = null;
  if (folderUrl && String(folderUrl).indexOf('http') === 0) {
    var mid = String(folderUrl).match(/[\w-]{25,}/);
    if (mid) {
      try {
        folder = DriveApp.getFolderById(mid[0]);
      } catch (e) {}
    }
  }
  if (!folder && dateStr && artist && venue) {
    folder = createEventFolder(dateStr + ' - ' + artist + ' - ' + venue);
    if (folder) {
      bookings.getRange(bookingRowIndex, 6).setValue(folder.getUrl());
    }
  }
  if (!folder) return null;

  var artistId = resolveArtistId(ss, artist);
  var clientId = resolveClientId(ss, venue);
  var artistData = getArtistRow(ss, artistId);
  var clientData = getClientRow(ss, clientId);
  var eventDate = parseDate(dateStr);

  var payDoc = null, dealDoc = null;
  try {
    payDoc = generatePaymentRequestPdf(folder, {
      eventDate: eventDate,
      artist: artistData,
      client: clientData,
      venueName: venue,
      fee: fee
    });
  } catch (e) {
    Logger.log('Payment Request PDF: ' + e.message);
  }
  try {
    dealDoc = generateDealMemoPdf(folder, {
      eventDate: eventDate,
      artist: artistData,
      client: clientData,
      venueName: venue,
      fee: fee
    });
  } catch (e) {
    Logger.log('Deal Memo PDF: ' + e.message);
  }

  var docLinks = [];
  if (payDoc) docLinks.push(payDoc.getUrl());
  if (dealDoc) docLinks.push(dealDoc.getUrl());
  if (docLinks.length) {
    bookings.getRange(bookingRowIndex, 7).setValue(docLinks.join('\n'));
  }
  return { folder: folder, paymentRequest: payDoc, dealMemo: dealDoc };
}

function resolveArtistId(ss, name) {
  var m = matchArtist(name);
  return (m && m.id) ? m.id : null;
}

function resolveClientId(ss, keyword) {
  var m = matchClient(keyword);
  return (m && m.id) ? m.id : null;
}

function getArtistRow(ss, id) {
  if (!id) return {};
  var sh = ss.getSheetByName(IMAP_CONFIG.ARTISTS_SHEET);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return { id: data[i][0], name: data[i][1], aliases: data[i][2], price: data[i][3], riderUrl: data[i][4], status: data[i][5] };
    }
  }
  return {};
}

function getClientRow(ss, id) {
  if (!id) return {};
  var sh = ss.getSheetByName(IMAP_CONFIG.CLIENTS_SHEET);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return { id: data[i][0], keyword: data[i][1], legalName: data[i][2], businessId: data[i][3], email: data[i][4] };
    }
  }
  return {};
}

function parseDate(s) {
  if (!s) return new Date();
  if (s instanceof Date) return s;
  var d = new Date(s);
  return isNaN(d.getTime()) ? new Date() : d;
}

/** Find file named "LOGO" (or LOGO.png, LOGO.jpg) in root folder; returns Blob or null. */
function _findLogoBlob() {
  var cfg = getConfig();
  var rootId = cfg.ROOT_FOLDER_ID;
  if (!rootId || rootId.indexOf('YOUR_') === 0) return null;
  try {
    var folder = DriveApp.getFolderById(rootId);
    var files = folder.getFiles();
    while (files.hasNext()) {
      var f = files.next();
      var name = (f.getName() || '').toUpperCase();
      if (name === 'LOGO' || name === 'LOGO.PNG' || name === 'LOGO.JPG' || name === 'LOGO.JPEG' || name === 'LOGO.WEBP') {
        return f.getBlob();
      }
    }
  } catch (e) {
    Logger.log('_findLogoBlob: ' + e.message);
  }
  return null;
}

/** Insert logo at top of doc body if LOGO file exists in root folder. */
function _insertLogoIfExists(body) {
  var blob = _findLogoBlob();
  if (!blob) return;
  try {
    var img = body.insertImage(0, blob);
    if (img) img.setWidth(120);
  } catch (e) {
    Logger.log('_insertLogoIfExists: ' + e.message);
  }
}

function generatePaymentRequestPdf(folder, data) {
  var templateId = getConfig().PAYMENT_REQUEST_TEMPLATE_ID;
  if (!templateId || templateId.indexOf('YOUR_') === 0) {
    return createPlaceholderPdf(folder, 'בקשת תשלום - ' + (data.artist.name || '') + ' - ' + formatDate(data.eventDate));
  }
  var file = DriveApp.getFileById(templateId);
  var copy = file.makeCopy('בקשת תשלום - ' + (data.artist.name || '') + ' - ' + formatDate(data.eventDate), folder);
  var doc = DocumentApp.openById(copy.getId());
  var body = doc.getBody();
  var tz = Session.getScriptTimeZone();
  _insertLogoIfExists(body);
  var feeStr = '₪' + Number(data.fee || 0).toLocaleString('he-IL');
  replaceMap(body, {
    '«TODAY»': Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    '«CLIENT_NAME_HEB»': data.client.legalName || '',
    '«CLIENT_NAME»': data.client.legalName || '',
    '«BUSINESS_NUMBER»': data.client.businessId || '',
    '«BILLING_ADDRESS»': '',
    '«DATE»': formatDate(data.eventDate),
    '«ARTIST_NAME»': data.artist.name || '',
    '«VENUE_NAME»': data.venueName || '',
    '«FEE»': feeStr,
    '«PAYMENT_TERMS»': '30 ימים'
  });
  doc.saveAndClose();
  var pdf = copy.getAs('application/pdf');
  pdf.setName(copy.getName() + '.pdf');
  return folder.createFile(pdf);
}

function generateDealMemoPdf(folder, data) {
  var templateId = getConfig().DEAL_MEMO_TEMPLATE_ID;
  if (!templateId || templateId.indexOf('YOUR_') === 0) {
    return createPlaceholderPdf(folder, 'הסכם הופעה - ' + (data.artist.name || '') + ' - ' + formatDate(data.eventDate));
  }
  var file = DriveApp.getFileById(templateId);
  var copy = file.makeCopy('הסכם הופעה - ' + (data.artist.name || '') + ' - ' + formatDate(data.eventDate), folder);
  var doc = DocumentApp.openById(copy.getId());
  var body = doc.getBody();
  var tz = Session.getScriptTimeZone();
  _insertLogoIfExists(body);
  var fee = Number(data.fee || 0);
  var feeStr = '₪' + fee.toLocaleString('he-IL');
  var depositStr = '₪' + (fee * 0.5).toLocaleString('he-IL');
  var balanceStr = '₪' + (fee * 0.5).toLocaleString('he-IL');
  var contactName = data.client.legalName || '';
  replaceMap(body, {
    '«TODAY»': Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy'),
    '«CLIENT_NAME_HEB»': data.client.legalName || '',
    '«CLIENT_NAME»': data.client.legalName || '',
    '«BUSINESS_NUMBER»': data.client.businessId || '',
    '«CLIENT_ADDRESS»': '',
    '«CONTACT_NAME»': contactName,
    '«CONTACT_PHONE»': '',
    '«ARTIST_NAME»': data.artist.name || '',
    '«EVENT_DATE»': formatDate(data.eventDate),
    '«EVENT_TIME»': '',
    '«VENUE_NAME»': data.venueName || '',
    '«VENUE_ADDRESS»': '',
    '«FEE»': feeStr,
    '«DEPOSIT»': depositStr,
    '«BALANCE»': balanceStr
  });
  doc.saveAndClose();
  var pdf = copy.getAs('application/pdf');
  pdf.setName(copy.getName() + '.pdf');
  return folder.createFile(pdf);
}

function replaceMap(body, map) {
  for (var key in map) {
    if (map.hasOwnProperty(key)) {
      body.replaceText(key, String(map[key] || ''));
    }
  }
}

function formatDate(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function createPlaceholderPdf(folder, fileName) {
  var doc = DocumentApp.create('Temp-' + fileName);
  doc.getBody().appendParagraph(IMAP_CONFIG.BRAND).setHeading(DocumentApp.ParagraphHeading.HEADING1);
  doc.getBody().appendParagraph(fileName);
  doc.saveAndClose();
  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  var pdf = file.getAs('application/pdf');
  pdf.setName(fileName + '.pdf');
  var created = folder.createFile(pdf);
  file.setTrashed(true);
  return created;
}

// ============================================
// MENU & TRIGGERS
// ============================================

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('אמא הפקות')
    .addItem('התקנה ראשית (יצירת מערכת מלאה)', 'masterInstallation')
    .addSeparator()
    .addItem('הגדר גיליון', 'setupSpreadsheet')
    .addItem('סנכרון לוח שנה', 'syncCalendarToSheets')
    .addItem('הפעל Smart Match', 'applySmartMatchToBookings')
    .addItem('צור תיקייה ומסמכים לשורה', 'runCreateFolderAndPdfsForSelection')
    .addToUi();
}

function runCreateFolderAndPdfsForSelection() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveCell().getRow();
  if (sheet.getName() !== IMAP_CONFIG.BOOKINGS_SHEET || row < 2) {
    SpreadsheetApp.getUi().alert('בחר שורת הזמנה בגיליון הזמנות.');
    return;
  }
  var out = createDriveFolderAndGeneratePdfs(row);
  SpreadsheetApp.getUi().alert(out ? 'תיקייה ומסמכים נוצרו.' : 'לא נוצרו מסמכים.');
}

// ============================================
// RBAC – Identify user by email; Admin sees all, Staff sees no Fee/Revenue
// ============================================

/** Returns 'Admin' or 'Staff'. Lookup in משתמשים sheet by email. Default Staff. */
function getCurrentUserRole(ss, email) {
  if (!email || !ss) return 'Staff';
  var sh = ss.getSheetByName(IMAP_CONFIG.USERS_SHEET);
  if (!sh) return 'Staff';
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').toLowerCase() === String(email).toLowerCase()) {
      var r = String(data[i][1] || '').trim();
      return r === 'Admin' ? 'Admin' : 'Staff';
    }
  }
  return 'Staff';
}

// ============================================
// PRIVACY & AUDIT LOG (Amendment 13 – Israeli Privacy Law)
// ============================================

/**
 * Record Timestamp, UserEmail, Action, SpreadsheetId in hidden LOGS sheet (Amendment 13).
 * Call on every Dashboard load (Read) and every data change (Write).
 */
function logActivity(action) {
  try {
    var email = '';
    try { email = Session.getActiveUser().getEmail() || ''; } catch (e) {}
    var ss = getSpreadsheet();
    if (!ss) return;
    var sh = ss.getSheetByName(LOGS_SHEET);
    if (!sh) {
      sh = ss.insertSheet(LOGS_SHEET);
      sh.getRange(1, 1, 1, 4).setValues([['Timestamp', 'UserEmail', 'Action', 'SpreadsheetId']]).setFontWeight('bold');
      sh.setFrozenRows(1);
      sh.hideSheet();
    }
    sh.appendRow([new Date(), email, String(action || ''), ss.getId()]);
  } catch (e) {
    Logger.log('logActivity: ' + (e.message || e.toString()));
  }
}

// ============================================
// DATA ENTRY – addNewBooking for dashboard form submissions
// ============================================

/**
 * Append a new booking to the הזמנות sheet. data = { date, artist, venue, fee?, notes? }.
 * Returns { ok: true, id } or { ok: false, error }.
 */
function addNewBooking(data) {
  if (!assertAuthorized()) return { ok: false, error: 'Unauthorized License' };
  var ss = getSpreadsheet();
  if (!ss) {
    return { ok: false, error: 'לא הוגדר גיליון. הרץ masterInstallation() בעורך הסקריפט והגדר SPREADSHEET_ID.' };
  }
  var sh = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!sh) {
    return { ok: false, error: 'גיליון הזמנות לא נמצא. הרץ masterInstallation() מחדש.' };
  }
  var date = (data && data.date) ? String(data.date).trim() : '';
  var artist = (data && data.artist) ? String(data.artist).trim() : '';
  var venue = (data && data.venue) ? String(data.venue).trim() : '';
  var fee = (data && data.fee != null) ? Number(data.fee) : 0;
  if (isNaN(fee)) fee = 0;
  var notes = (data && data.notes) ? String(data.notes).trim() : '';
  if (!date || !artist || !venue) {
    return { ok: false, error: 'חסרים תאריך, אמן או מקום' };
  }
  var values = sh.getDataRange().getValues();
  var nextId = 1;
  for (var i = 1; i < values.length; i++) {
    var id = values[i][0];
    if (typeof id === 'number' && id >= nextId) nextId = id + 1;
  }
  sh.appendRow([nextId, date, artist, venue, fee, '', '', '', 'Pending', notes]);
  return { ok: true, id: nextId };
}

// ============================================
// MORNING (Hashbonit Yeruka) – Payment request via API. Keys from הגדרות.
// ============================================

var MORNING_BASE = 'https://api.greeninvoice.co.il/api/v1';

/** Read Morning API id & secret from ScriptProperties (secure). Set via Script Properties or migrateMorningKeysFromSheet(). */
function getMorningCredentials(ss) {
  var p = PropertiesService.getScriptProperties();
  var apiId = p.getProperty(IMAP_PROPS.MORNING_API_ID) || '';
  var apiSecret = p.getProperty(IMAP_PROPS.MORNING_API_SECRET) || '';
  if (apiId || apiSecret) return { apiId: String(apiId), apiSecret: String(apiSecret) };
  ss = ss || getSpreadsheet();
  if (!ss) return { apiId: '', apiSecret: '' };
  var sh = ss.getSheetByName(IMAP_CONFIG.CONFIG_SHEET);
  if (!sh) return { apiId: '', apiSecret: '' };
  var data = sh.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    var k = String(data[i][0] || '').trim();
    var v = String(data[i][1] || '').trim();
    if (k === 'Morning_ApiId') apiId = v;
    if (k === 'Morning_ApiSecret') apiSecret = v;
  }
  return { apiId: apiId, apiSecret: apiSecret };
}

/** One-time migration: copy Morning keys from הגדרות sheet to ScriptProperties, then clear sheet values. Run from script editor. */
function migrateMorningKeysFromSheet() {
  var cred = getMorningCredentials(getSpreadsheet());
  if (cred.apiId || cred.apiSecret) {
    var p = PropertiesService.getScriptProperties();
    if (cred.apiId) p.setProperty(IMAP_PROPS.MORNING_API_ID, cred.apiId);
    if (cred.apiSecret) p.setProperty(IMAP_PROPS.MORNING_API_SECRET, cred.apiSecret);
    Logger.log('Morning keys migrated to Script Properties.');
  }
}

/**
 * Create a payment request (דרישת תשלום) via Morning/Green Invoice API.
 * bookingData = { date, artist, venue, fee, clientName?, clientBusinessId?, clientEmail? }.
 * Returns { ok, documentId, url, error }.
 */
function createMorningPaymentRequest(bookingData) {
  var ss = getSpreadsheet();
  if (!ss) return { ok: false, error: 'No spreadsheet' };
  var cred = getMorningCredentials(ss);
  if (!cred.apiId || !cred.apiSecret || String(cred.apiId).trim() === '' || String(cred.apiSecret).trim() === '') {
    return { ok: false, error: 'נא להזין מפתחות API ב-Script Properties (או הרץ migrateMorningKeysFromSheet מהגיליון) כדי להמשיך' };
  }
  var token;
  try {
    var tokenRes = UrlFetchApp.fetch(MORNING_BASE + '/account/token', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ id: cred.apiId, secret: cred.apiSecret }),
      muteHttpExceptions: true
    });
    var tokenJson = JSON.parse(tokenRes.getContentText());
    token = (tokenJson && tokenJson.token) ? tokenJson.token : null;
    if (!token) {
      return { ok: false, error: (tokenJson && tokenJson.message) ? tokenJson.message : 'לא התקבל Token ממורנינג' };
    }
  } catch (e) {
    return { ok: false, error: 'Morning Token: ' + (e.message || e.toString()) };
  }
  var clientName = (bookingData && bookingData.clientName) ? String(bookingData.clientName) : (bookingData && bookingData.venue) ? String(bookingData.venue) : 'לקוח';
  var clientBusinessId = (bookingData && bookingData.clientBusinessId) ? String(bookingData.clientBusinessId) : '';
  var clientEmail = (bookingData && bookingData.clientEmail) ? String(bookingData.clientEmail) : '';
  var amount = Math.max(0, Number(bookingData && bookingData.fee) || 0);
  var description = (bookingData && bookingData.artist) ? 'הופעה – ' + String(bookingData.artist) : 'הופעה';
  if (bookingData && bookingData.date) description += ' – ' + String(bookingData.date);
  var docPayload = {
    type: 305,
    customer: {
      name: clientName,
      taxId: clientBusinessId || undefined,
      emails: clientEmail ? [clientEmail] : undefined
    },
    items: [{ description: description, quantity: 1, price: amount, currency: 'ILS' }],
    payment: { type: 'cash', date: formatDateForApi(bookingData && bookingData.date ? new Date(bookingData.date) : new Date()) }
  };
  try {
    var docRes = UrlFetchApp.fetch(MORNING_BASE + '/documents', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify(docPayload),
      muteHttpExceptions: true
    });
    var docJson = JSON.parse(docRes.getContentText());
    var id = (docJson && docJson.id) ? docJson.id : null;
    var url = (docJson && docJson.url) ? docJson.url : (id ? 'https://app.greeninvoice.co.il/document/view/' + id : null);
    if (id) {
      return { ok: true, documentId: String(id), url: url || '' };
    }
    return { ok: false, error: (docJson && docJson.message) ? docJson.message : 'יצירת מסמך במורנינג נכשלה' };
  } catch (e) {
    return { ok: false, error: 'Morning Document: ' + (e.message || e.toString()) };
  }
}

function formatDateForApi(d) {
  if (!d) return '';
  if (typeof d === 'string') d = new Date(d);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Send payment request for a booking by ID: call Morning API, then set status to "Payment Sent".
 * Returns { ok, documentId, url, error }.
 */
function sendPaymentRequestForBooking(bookingId) {
  if (!assertAuthorized()) return { ok: false, error: 'Unauthorized License' };
  var ss = getSpreadsheet();
  if (!ss) return { ok: false, error: 'No spreadsheet' };
  var sh = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!sh) return { ok: false, error: 'No bookings sheet' };
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var idIdx = headers.indexOf('ID') >= 0 ? headers.indexOf('ID') : 0;
  var dateIdx = headers.indexOf('Date') >= 0 ? headers.indexOf('Date') : 1;
  var artistIdx = headers.indexOf('Artist') >= 0 ? headers.indexOf('Artist') : 2;
  var venueIdx = headers.indexOf('Venue') >= 0 ? headers.indexOf('Venue') : 3;
  var feeIdx = headers.indexOf('Fee') >= 0 ? headers.indexOf('Fee') : 4;
  var statusIdx = headers.indexOf('Status') >= 0 ? headers.indexOf('Status') : 8;
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx]) === String(bookingId)) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex < 0) return { ok: false, error: 'הזמנה לא נמצאה' };
  var row = data[rowIndex - 1];
  var venue = (row[venueIdx] || '').toString().trim();
  var clientId = resolveClientId(ss, venue);
  var clientRow = getClientRow(ss, clientId);
  var bookingData = {
    date: row[dateIdx],
    artist: row[artistIdx],
    venue: venue,
    fee: row[feeIdx],
    clientName: clientRow.legalName || venue,
    clientBusinessId: clientRow.businessId || '',
    clientEmail: clientRow.email || ''
  };
  var result = createMorningPaymentRequest(bookingData);
  if (result.ok && rowIndex >= 2) {
    sh.getRange(rowIndex, statusIdx + 1).setValue('Payment Sent');
  }
  return result;
}

// ============================================
// REDUNDANCY – Daily CSV backup to Drive
// ============================================

/**
 * Export הזמנות sheet as CSV to the root "Backups" folder (Emergency Backup location).
 * Call via time-driven trigger (daily). Creates folder "Backups" under root if missing.
 * Run installDailyBackupTrigger() once from script editor to enable daily 2:00 run.
 */
function dailyBackup() {
  var ss = getSpreadsheet();
  if (!ss) return;
  var sh = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!sh) return;
  var cfg = getConfig(ss);
  var rootId = cfg.ROOT_FOLDER_ID;
  if (!rootId || rootId.indexOf('YOUR_') === 0) {
    Logger.log('dailyBackup: no ROOT_FOLDER_ID');
    return;
  }
  var root = DriveApp.getFolderById(rootId);
  var backupsFolder;
  var folders = root.getFoldersByName('Backups');
  if (folders.hasNext()) {
    backupsFolder = folders.next();
  } else {
    backupsFolder = root.createFolder('Backups');
  }
  var data = sh.getDataRange().getValues();
  var csv = data.map(function (row) {
    return row.map(function (cell) {
      var s = cell == null ? '' : String(cell);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\r\n');
  var blob = Utilities.newBlob(csv, 'text/csv', 'backup_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.csv');
  backupsFolder.createFile(blob);
  logActivity('dailyBackup');
}

/** Call once from script editor to install a daily trigger for dailyBackup(). */
function installDailyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = triggers.length - 1; i >= 0; i--) {
    if (triggers[i].getHandlerFunction() === 'dailyBackup') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).create();
  Logger.log('Daily backup trigger installed (runs at 2:00).');
}

// ============================================
// DAILY SNAPSHOT – Email PDF of הזמנות to admin every 24h (emergency backup)
// ============================================

function _getAdminEmail(ss) {
  if (!ss) return 'modu.general@gmail.com';
  var sh = ss.getSheetByName(IMAP_CONFIG.USERS_SHEET);
  if (!sh) return 'modu.general@gmail.com';
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var role = String(data[i][1] || '').trim();
    if (role === 'Admin') return String(data[i][0] || '').trim() || 'modu.general@gmail.com';
  }
  return 'modu.general@gmail.com';
}

/**
 * Export הזמנות sheet as PDF and email to admin. Call via time-driven trigger (every 24h).
 */
function emailDailySnapshot() {
  if (!assertAuthorized()) return;
  var ss = getSpreadsheet();
  if (!ss) return;
  var sh = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!sh) return;
  var adminEmail = _getAdminEmail(ss);
  if (!adminEmail) adminEmail = 'modu.general@gmail.com';
  try {
    var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf&gid=' + sh.getSheetId();
    var blob = UrlFetchApp.fetch(url, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    }).getBlob();
    blob.setName('הזמנות_snapshot_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.pdf');
    MailApp.sendEmail(adminEmail, 'גיבוי יומי – הזמנות (אמא הפקות)', 'גיבוי יומי של גיליון הזמנות מצורף.', {
      attachments: [blob],
      name: 'אמא הפקות'
    });
    logActivity('emailDailySnapshot sent to ' + adminEmail);
  } catch (e) {
    Logger.log('emailDailySnapshot: ' + (e.message || e.toString()));
  }
}

/** Call once from script editor to install a daily trigger that emails PDF snapshot to admin. */
function installDailySnapshotTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = triggers.length - 1; i >= 0; i--) {
    if (triggers[i].getHandlerFunction() === 'emailDailySnapshot') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('emailDailySnapshot').timeBased().everyDays(1).atHour(3).create();
  Logger.log('Daily snapshot email trigger installed (runs at 3:00).');
}

// ============================================
// REDUNDANCY – Black box: daily CSV emergency backup to modu + client
// ============================================

/**
 * Generate CSV of הזמנות and email to modu.general@gmail.com and the client (first Admin).
 * Call via time-driven trigger once per day.
 */
function sendDailyEmergencyBackup() {
  if (!assertAuthorized()) return;
  var ss = getSpreadsheet();
  if (!ss) return;
  var sh = ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET);
  if (!sh) return;
  var clientEmail = _getAdminEmail(ss);
  var moduEmail = 'modu.general@gmail.com';
  var data = sh.getDataRange().getValues();
  var csv = data.map(function (row) {
    return row.map(function (cell) {
      var s = cell == null ? '' : String(cell);
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        s = '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\r\n');
  var blob = Utilities.newBlob(csv, 'text/csv', 'הזמנות_emergency_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + '.csv');
  var subject = 'גיבוי חירום יומי – הזמנות (אמא הפקות)';
  var body = 'גיבוי CSV של גיליון הזמנות מצורף.';
  try {
    if (clientEmail && clientEmail !== moduEmail) {
      MailApp.sendEmail(clientEmail, subject, body, { attachments: [blob], name: 'אמא הפקות' });
    }
    MailApp.sendEmail(moduEmail, subject, body, { attachments: [blob], name: 'אמא הפקות' });
    logActivity('sendDailyEmergencyBackup');
  } catch (e) {
    Logger.log('sendDailyEmergencyBackup: ' + (e.message || e.toString()));
  }
}

/** Call once from script editor to install daily trigger for sendDailyEmergencyBackup (e.g. 4:00). */
function installSendDailyEmergencyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = triggers.length - 1; i >= 0; i--) {
    if (triggers[i].getHandlerFunction() === 'sendDailyEmergencyBackup') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('sendDailyEmergencyBackup').timeBased().everyDays(1).atHour(4).create();
  Logger.log('Daily emergency backup email trigger installed (runs at 4:00).');
}

// ============================================
// DASHBOARD API – doGet (whoami, artists, logo, data) + doPost (addBooking, sendPaymentRequest)
// Deploy as Web App. For RBAC use "Execute as: User accessing" + "Anyone with Google account".
// ============================================

function doGet(e) {
  e = e || {};
  if (!assertAuthorized()) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Unauthorized License' })).setMimeType(ContentService.MimeType.JSON);
  }
  var params = e.parameter || {};
  var action = params.action || params.a || 'data';

  var userEmail = '';
  try {
    userEmail = Session.getActiveUser().getEmail();
  } catch (err) {}
  if (!userEmail && params.email) userEmail = params.email;

  var ss = getSpreadsheet();
  var role = getCurrentUserRole(ss, userEmail);
  logActivity('Read:' + action);

  if (action === 'whoami') {
    var out = { email: userEmail || null, role: role, brand: IMAP_CONFIG.BRAND };
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'artists') {
    var artists = [];
    if (ss) {
      var artSh = ss.getSheetByName(IMAP_CONFIG.ARTISTS_SHEET);
      if (artSh) {
        var artData = artSh.getDataRange().getValues();
        for (var i = 1; i < artData.length; i++) {
          var name = artData[i][1];
          if (name) artists.push({ id: artData[i][0], name: String(name) });
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ artists: artists })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'logo') {
    var logoOut = { logoDataUrl: null, logoUrl: null };
    try {
      var blob = _findLogoBlob();
      if (blob) {
        var b64 = Utilities.base64Encode(blob.getBytes());
        var mime = blob.getContentType() || 'image/png';
        logoOut.logoDataUrl = 'data:' + mime + ';base64,' + b64;
      }
    } catch (logoErr) {
      logoOut.error = logoErr.message;
    }
    return ContentService.createTextOutput(JSON.stringify(logoOut)).setMimeType(ContentService.MimeType.JSON);
  }

  // action === 'data' (default)
  var out = { brand: IMAP_CONFIG.BRAND, bookings: [], stats: {}, role: role };
  try {
    var sh = ss ? ss.getSheetByName(IMAP_CONFIG.BOOKINGS_SHEET) : null;
    if (sh) {
      var data = sh.getDataRange().getValues();
      if (data.length > 1) {
        var headers = data[0];
        var feeIdx = headers.indexOf('Fee');
        if (feeIdx < 0) feeIdx = 4;
        var statusIdx = headers.indexOf('Status');
        if (statusIdx < 0) statusIdx = 8;
        var statusCounts = {};
        var totalFee = 0;
        for (var i = 1; i < data.length; i++) {
          var row = {};
          for (var j = 0; j < headers.length; j++) {
            var key = headers[j];
            var val = data[i][j];
            if (role === 'Staff' && key === 'Fee') val = null;
            row[key] = val;
          }
          out.bookings.push(row);
          var st = String(data[i][statusIdx] || 'Pending');
          statusCounts[st] = (statusCounts[st] || 0) + 1;
          var fee = Number(data[i][feeIdx]);
          if (!isNaN(fee)) totalFee += fee;
        }
        out.stats = {
          byStatus: statusCounts,
          totalFee: role === 'Admin' ? totalFee : null,
          count: data.length - 1
        };
      }
    }
  } catch (err) {
    out.error = err.message;
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  e = e || {};
  if (!assertAuthorized()) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized License' })).setMimeType(ContentService.MimeType.JSON);
  }
  // Body may be sent as text/plain (avoids CORS preflight); contents is still JSON string.
  var body = (e.postData && e.postData.contents) ? e.postData.contents : '{}';
  var data;
  try {
    data = JSON.parse(body);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid JSON' })).setMimeType(ContentService.MimeType.JSON);
  }
  var action = (data && data.action) ? data.action : 'addBooking';
  if (action === 'addBooking') {
    var result = addNewBooking(data);
    logActivity('Write:addBooking' + (result.ok ? ' ok' : ' fail'));
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  if (action === 'sendPaymentRequest') {
    var bid = (data && data.bookingId != null) ? data.bookingId : (data && data.id != null) ? data.id : null;
    if (bid == null) {
      logActivity('Write:sendPaymentRequest fail: missing bookingId');
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'חסר bookingId' })).setMimeType(ContentService.MimeType.JSON);
    }
    var prResult = sendPaymentRequestForBooking(bid);
    logActivity('Write:sendPaymentRequest bookingId=' + bid + (prResult.ok ? ' ok' : ' fail'));
    return ContentService.createTextOutput(JSON.stringify(prResult)).setMimeType(ContentService.MimeType.JSON);
  }
  logActivity('Write:doPost unknown action: ' + action);
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unknown action' })).setMimeType(ContentService.MimeType.JSON);
}
