/**
 * Artist-Ops 360 - Google Sheets Version
 * 
 * Alternative implementation using Google Sheets as the database
 * All-in-one script for calendar sync, lookups, and automation
 * 
 * @version 1.0.0
 */

// ============================================
// CONFIGURATION
// ============================================

const SHEETS_CONFIG = {
  // Spreadsheet ID (from URL)
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID',
  
  // Sheet names
  ARTISTS_SHEET: 'Artists',
  CLIENTS_SHEET: 'Clients',
  BOOKINGS_SHEET: 'Bookings',
  CONFIG_SHEET: 'Config',
  
  // Calendar
  CALENDAR_ID: 'primary',
  
  // Drive
  BOOKINGS_FOLDER_ID: 'YOUR_FOLDER_ID',
  PAYMENT_REQUEST_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  DEAL_MEMO_TEMPLATE_ID: 'YOUR_TEMPLATE_ID',
  
  // Settings
  SYNC_DAYS_AHEAD: 90,
  EVENT_PATTERN: /^(.+)\s*@\s*(.+)$/
};

// ============================================
// SPREADSHEET SETUP
// ============================================

/**
 * Run once to set up the entire spreadsheet structure
 */
function setupSpreadsheet() {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  
  // Create Artists sheet
  let artistsSheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  if (!artistsSheet) {
    artistsSheet = ss.insertSheet(SHEETS_CONFIG.ARTISTS_SHEET);
  }
  artistsSheet.getRange('A1:O1').setValues([[
    'ID', 'Name', 'Email', 'Phone', 'Manager Name', 'Manager Email',
    'Base Price', 'Price Notes', 'Technical Rider URL', 'Logo URL',
    'Genre', 'Status', 'Notes', 'Created At', 'Updated At'
  ]]);
  artistsSheet.getRange('A1:O1').setFontWeight('bold').setBackground('#4a5568').setFontColor('white');
  artistsSheet.setFrozenRows(1);
  
  // Create Clients sheet
  let clientsSheet = ss.getSheetByName(SHEETS_CONFIG.CLIENTS_SHEET);
  if (!clientsSheet) {
    clientsSheet = ss.insertSheet(SHEETS_CONFIG.CLIENTS_SHEET);
  }
  clientsSheet.getRange('A1:Q1').setValues([[
    'ID', 'Search Keyword', 'Legal Name', 'Legal Name (Hebrew)', 'Business Number',
    'VAT ID', 'Billing Email', 'Billing Address', 'Contact Name', 'Contact Phone',
    'Payment Terms', 'Default Venue', 'Venue Address', 'Venue Capacity',
    'Notes', 'Status', 'Flag Incomplete'
  ]]);
  clientsSheet.getRange('A1:Q1').setFontWeight('bold').setBackground('#4a5568').setFontColor('white');
  clientsSheet.setFrozenRows(1);
  
  // Create Bookings sheet
  let bookingsSheet = ss.getSheetByName(SHEETS_CONFIG.BOOKINGS_SHEET);
  if (!bookingsSheet) {
    bookingsSheet = ss.insertSheet(SHEETS_CONFIG.BOOKINGS_SHEET);
  }
  bookingsSheet.getRange('A1:V1').setValues([[
    'ID', 'Event Date', 'Event Time', 'Calendar ID', 'Artist ID', 'Artist Name',
    'Client ID', 'Client Name', 'Venue Name', 'Fee', 'Deposit', 'Deposit Paid',
    'Deposit Date', 'Balance Due', 'Status', 'Payment Status', 'Contract Signed',
    'Drive Folder', 'Payment Request', 'Deal Memo', 'Notes', 'Created By'
  ]]);
  bookingsSheet.getRange('A1:V1').setFontWeight('bold').setBackground('#4a5568').setFontColor('white');
  bookingsSheet.setFrozenRows(1);
  
  // Create Config sheet
  let configSheet = ss.getSheetByName(SHEETS_CONFIG.CONFIG_SHEET);
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEETS_CONFIG.CONFIG_SHEET);
  }
  
  // Add dropdowns data
  configSheet.getRange('A1:A6').setValues([
    ['Status Options'],
    ['Pending'],
    ['Confirmed'],
    ['Completed'],
    ['Cancelled'],
    ['On Hold']
  ]);
  
  configSheet.getRange('B1:B5').setValues([
    ['Payment Status'],
    ['Paid'],
    ['Partial'],
    ['Overdue'],
    ['Pending']
  ]);
  
  configSheet.getRange('C1:C5').setValues([
    ['Payment Terms'],
    ['Net 30'],
    ['Net 45'],
    ['Net 60'],
    ['Immediate']
  ]);
  
  // Add data validation to Bookings sheet
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(configSheet.getRange('A2:A6'))
    .build();
  bookingsSheet.getRange('O2:O1000').setDataValidation(statusRule);
  
  const paymentStatusRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(configSheet.getRange('B2:B5'))
    .build();
  bookingsSheet.getRange('P2:P1000').setDataValidation(paymentStatusRule);
  
  // Format columns
  bookingsSheet.getRange('B2:B1000').setNumberFormat('yyyy-mm-dd');
  bookingsSheet.getRange('J2:K1000').setNumberFormat('₪#,##0');
  bookingsSheet.getRange('N2:N1000').setNumberFormat('₪#,##0');
  
  Logger.log('✅ Spreadsheet setup complete!');
}

/**
 * Add conditional formatting for status badges
 */
function addConditionalFormatting() {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const bookingsSheet = ss.getSheetByName(SHEETS_CONFIG.BOOKINGS_SHEET);
  
  // Status column (O) formatting
  const statusRange = bookingsSheet.getRange('O2:O1000');
  
  // Green for Confirmed/Completed
  const greenRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Confirmed')
    .setBackground('#c6f6d5')
    .setRanges([statusRange])
    .build();
  
  // Yellow for Pending
  const yellowRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Pending')
    .setBackground('#fefcbf')
    .setRanges([statusRange])
    .build();
  
  // Red for Cancelled
  const redRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Cancelled')
    .setBackground('#fed7d7')
    .setRanges([statusRange])
    .build();
  
  // Payment Status column (P)
  const paymentRange = bookingsSheet.getRange('P2:P1000');
  
  const paidRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Paid')
    .setBackground('#c6f6d5')
    .setRanges([paymentRange])
    .build();
  
  const overdueRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains('Overdue')
    .setBackground('#fed7d7')
    .setRanges([paymentRange])
    .build();
  
  bookingsSheet.setConditionalFormatRules([greenRule, yellowRule, redRule, paidRule, overdueRule]);
  
  Logger.log('✅ Conditional formatting added!');
}

// ============================================
// LOOKUP FUNCTIONS
// ============================================

/**
 * Custom function: Lookup artist by name
 * Usage: =ARTIST_LOOKUP("Artist Name")
 */
function ARTIST_LOOKUP(artistName) {
  if (!artistName) return '';
  
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toLowerCase() === artistName.toLowerCase()) {
      return data[i][0]; // Return ID
    }
  }
  return 'NEW';
}

/**
 * Custom function: Lookup client by keyword
 * Usage: =CLIENT_LOOKUP("Venue Name")
 */
function CLIENT_LOOKUP(venueName) {
  if (!venueName) return '';
  
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.CLIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  const venueNameLower = venueName.toLowerCase();
  
  for (let i = 1; i < data.length; i++) {
    const keyword = String(data[i][1]).toLowerCase();
    if (keyword && venueNameLower.includes(keyword)) {
      return data[i][0]; // Return ID
    }
  }
  return 'NEW';
}

/**
 * Custom function: Get client legal name by ID
 * Usage: =CLIENT_NAME(clientId)
 */
function CLIENT_NAME(clientId) {
  if (!clientId || clientId === 'NEW') return '';
  
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.CLIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(clientId)) {
      return data[i][2]; // Legal Name column
    }
  }
  return '';
}

/**
 * Custom function: Get artist name by ID
 * Usage: =ARTIST_NAME(artistId)
 */
function ARTIST_NAME(artistId) {
  if (!artistId || artistId === 'NEW') return '';
  
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(artistId)) {
      return data[i][1]; // Name column
    }
  }
  return '';
}

/**
 * Custom function: Get artist base price
 * Usage: =ARTIST_PRICE(artistId)
 */
function ARTIST_PRICE(artistId) {
  if (!artistId || artistId === 'NEW') return 0;
  
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(artistId)) {
      return data[i][6] || 0; // Base Price column
    }
  }
  return 0;
}

// ============================================
// CALENDAR SYNC FOR SHEETS
// ============================================

/**
 * Sync calendar events to Google Sheets
 */
function syncCalendarToSheets() {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const bookingsSheet = ss.getSheetByName(SHEETS_CONFIG.BOOKINGS_SHEET);
  
  const now = new Date();
  const futureDate = new Date(now.getTime() + SHEETS_CONFIG.SYNC_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  
  const calendar = CalendarApp.getCalendarById(SHEETS_CONFIG.CALENDAR_ID);
  const events = calendar.getEvents(now, futureDate);
  
  // Get existing calendar IDs
  const existingData = bookingsSheet.getDataRange().getValues();
  const existingCalendarIds = new Set(existingData.slice(1).map(row => row[3]));
  
  let created = 0;
  
  for (const event of events) {
    const calendarId = event.getId();
    
    // Skip if already exists
    if (existingCalendarIds.has(calendarId)) continue;
    
    const title = event.getTitle();
    const match = title.match(SHEETS_CONFIG.EVENT_PATTERN);
    
    if (!match) {
      Logger.log(`⚠️ Skipping: "${title}" (format mismatch)`);
      continue;
    }
    
    const artistName = match[1].trim();
    const venueName = match[2].trim();
    
    // Lookup or flag for manual entry
    const artistId = findOrCreateArtist(artistName);
    const clientResult = findOrCreateClient(venueName);
    
    // Generate next booking ID
    const lastRow = bookingsSheet.getLastRow();
    const newId = lastRow > 1 ? existingData[lastRow - 1][0] + 1 : 1;
    
    // Get artist price
    const fee = getArtistPrice(artistId);
    
    // Create Drive folder
    const eventDate = event.getStartTime();
    const folderName = Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') + 
                       ` - ${artistName} - ${venueName}`;
    const folder = createEventFolder(folderName);
    
    // Add booking row
    const newRow = [
      newId,
      Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      Utilities.formatDate(eventDate, Session.getScriptTimeZone(), 'HH:mm'),
      calendarId,
      artistId,
      artistName,
      clientResult.id,
      clientResult.name || venueName,
      venueName,
      fee,
      fee * 0.5, // 50% deposit
      false,
      '',
      fee * 0.5, // Balance
      'Pending',
      'Pending',
      false,
      folder.getUrl(),
      '', // Payment request URL (generate later)
      '', // Deal memo URL (generate later)
      clientResult.isNew ? '⚠️ New client - needs legal info' : '',
      'Calendar Sync'
    ];
    
    bookingsSheet.appendRow(newRow);
    created++;
    
    Logger.log(`✅ Created: ${artistName} @ ${venueName}`);
  }
  
  Logger.log(`\n📊 Sync complete: ${created} bookings created`);
  return created;
}

/**
 * Find or create artist
 */
function findOrCreateArtist(artistName) {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  // Look for existing
  for (let i = 1; i < data.length; i++) {
    if (data[i][1].toLowerCase() === artistName.toLowerCase()) {
      return data[i][0];
    }
  }
  
  // Create new
  const newId = data.length > 1 ? Math.max(...data.slice(1).map(r => r[0] || 0)) + 1 : 1;
  const newRow = [
    newId, artistName, '', '', '', '', 0, '', '', '',
    '', 'Active', 'Auto-created - needs completion',
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  ];
  
  sheet.appendRow(newRow);
  return newId;
}

/**
 * Find or create client
 */
function findOrCreateClient(venueName) {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.CLIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  const venueNameLower = venueName.toLowerCase();
  
  // Look for existing
  for (let i = 1; i < data.length; i++) {
    const keyword = String(data[i][1]).toLowerCase();
    if (keyword && venueNameLower.includes(keyword)) {
      return {
        id: data[i][0],
        name: data[i][2],
        isNew: false
      };
    }
  }
  
  // Create new
  const newId = data.length > 1 ? Math.max(...data.slice(1).map(r => r[0] || 0)) + 1 : 1;
  const newRow = [
    newId, venueName, venueName, '', '', '', '', '', '', '',
    'Net 30', venueName, '', '', '', 'Prospect', true
  ];
  
  sheet.appendRow(newRow);
  return {
    id: newId,
    name: venueName,
    isNew: true
  };
}

/**
 * Get artist price by ID
 */
function getArtistPrice(artistId) {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === artistId) {
      return data[i][6] || 0;
    }
  }
  return 0;
}

/**
 * Create event folder in Drive
 */
function createEventFolder(name) {
  const parent = DriveApp.getFolderById(SHEETS_CONFIG.BOOKINGS_FOLDER_ID);
  const existing = parent.getFoldersByName(name);
  
  if (existing.hasNext()) {
    return existing.next();
  }
  
  return parent.createFolder(name);
}

// ============================================
// DOCUMENT GENERATION
// ============================================

/**
 * Generate documents for a booking row
 * Call from custom menu or button
 */
function generateDocumentsForRow(rowNumber) {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const bookingsSheet = ss.getSheetByName(SHEETS_CONFIG.BOOKINGS_SHEET);
  const row = bookingsSheet.getRange(rowNumber, 1, 1, 22).getValues()[0];
  
  // Get related data
  const artistId = row[4];
  const clientId = row[6];
  
  const artistData = getArtistData(artistId);
  const clientData = getClientData(clientId);
  
  // Get folder
  const folderUrl = row[17];
  const folderId = folderUrl.match(/[-\w]{25,}/)[0];
  const folder = DriveApp.getFolderById(folderId);
  
  // Generate documents
  const eventDate = new Date(row[1]);
  const paymentRequest = generatePaymentRequest(folder, {
    eventDate: eventDate,
    artist: artistData,
    client: clientData,
    venueName: row[8],
    fee: row[9]
  });
  
  const dealMemo = generateDealMemo(folder, {
    eventDate: eventDate,
    eventTime: row[2],
    artist: artistData,
    client: clientData,
    venueName: row[8],
    fee: row[9]
  });
  
  // Update row with URLs
  bookingsSheet.getRange(rowNumber, 19).setValue(paymentRequest.getUrl());
  bookingsSheet.getRange(rowNumber, 20).setValue(dealMemo.getUrl());
  
  Logger.log(`✅ Documents generated for row ${rowNumber}`);
  return { paymentRequest, dealMemo };
}

/**
 * Get artist data by ID
 */
function getArtistData(artistId) {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.ARTISTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === artistId) {
      const result = {};
      headers.forEach((h, idx) => result[h.toLowerCase().replace(/ /g, '_')] = data[i][idx]);
      return result;
    }
  }
  return {};
}

/**
 * Get client data by ID
 */
function getClientData(clientId) {
  const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS_CONFIG.CLIENTS_SHEET);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === clientId) {
      const result = {};
      headers.forEach((h, idx) => result[h.toLowerCase().replace(/ /g, '_')] = data[i][idx]);
      return result;
    }
  }
  return {};
}

/**
 * Generate payment request document
 */
function generatePaymentRequest(folder, data) {
  const template = DriveApp.getFileById(SHEETS_CONFIG.PAYMENT_REQUEST_TEMPLATE_ID);
  const dateStr = Utilities.formatDate(data.eventDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const fileName = `בקשת תשלום - ${data.artist.name || ''} - ${dateStr}`;
  
  const copy = template.makeCopy(fileName, folder);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  
  const replacements = {
    '{{DATE}}': dateStr,
    '{{ARTIST_NAME}}': data.artist.name || '',
    '{{CLIENT_NAME}}': data.client.legal_name || '',
    '{{CLIENT_NAME_HEB}}': data.client['legal_name_(hebrew)'] || data.client.legal_name || '',
    '{{BUSINESS_NUMBER}}': data.client.business_number || '',
    '{{BILLING_ADDRESS}}': data.client.billing_address || '',
    '{{VENUE_NAME}}': data.venueName || '',
    '{{FEE}}': '₪' + Number(data.fee).toLocaleString('he-IL'),
    '{{TODAY}}': Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy')
  };
  
  for (const [key, value] of Object.entries(replacements)) {
    body.replaceText(key, String(value));
  }
  
  doc.saveAndClose();
  
  // Convert to PDF
  const pdf = copy.getAs('application/pdf');
  pdf.setName(fileName + '.pdf');
  return folder.createFile(pdf);
}

/**
 * Generate deal memo document
 */
function generateDealMemo(folder, data) {
  const template = DriveApp.getFileById(SHEETS_CONFIG.DEAL_MEMO_TEMPLATE_ID);
  const dateStr = Utilities.formatDate(data.eventDate, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  const fileName = `הסכם הופעה - ${data.artist.name || ''} - ${dateStr}`;
  
  const copy = template.makeCopy(fileName, folder);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  
  const replacements = {
    '{{EVENT_DATE}}': dateStr,
    '{{EVENT_TIME}}': data.eventTime || '',
    '{{ARTIST_NAME}}': data.artist.name || '',
    '{{CLIENT_NAME}}': data.client.legal_name || '',
    '{{BUSINESS_NUMBER}}': data.client.business_number || '',
    '{{VENUE_NAME}}': data.venueName || '',
    '{{VENUE_ADDRESS}}': data.client.venue_address || '',
    '{{FEE}}': '₪' + Number(data.fee).toLocaleString('he-IL'),
    '{{DEPOSIT}}': '₪' + Number(data.fee * 0.5).toLocaleString('he-IL'),
    '{{TODAY}}': Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy')
  };
  
  for (const [key, value] of Object.entries(replacements)) {
    body.replaceText(key, String(value));
  }
  
  doc.saveAndClose();
  
  // Convert to PDF
  const pdf = copy.getAs('application/pdf');
  pdf.setName(fileName + '.pdf');
  return folder.createFile(pdf);
}

// ============================================
// CUSTOM MENU
// ============================================

/**
 * Add custom menu to spreadsheet
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎤 Artist-Ops')
    .addItem('🔄 Sync Calendar', 'syncCalendarToSheets')
    .addItem('📄 Generate Docs (Selected Row)', 'generateDocsForSelectedRow')
    .addSeparator()
    .addItem('⚙️ Setup Spreadsheet', 'setupSpreadsheet')
    .addItem('🎨 Add Formatting', 'addConditionalFormatting')
    .addItem('🔧 Test Configuration', 'testSheetsConfiguration')
    .addToUi();
}

/**
 * Generate documents for currently selected row
 */
function generateDocsForSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const row = sheet.getActiveCell().getRow();
  
  if (sheet.getName() !== SHEETS_CONFIG.BOOKINGS_SHEET || row < 2) {
    SpreadsheetApp.getUi().alert('Please select a booking row in the Bookings sheet.');
    return;
  }
  
  generateDocumentsForRow(row);
  SpreadsheetApp.getUi().alert('Documents generated successfully!');
}

/**
 * Test configuration
 */
function testSheetsConfiguration() {
  let message = 'Configuration Test:\n\n';
  
  try {
    const ss = SpreadsheetApp.openById(SHEETS_CONFIG.SPREADSHEET_ID);
    message += '✅ Spreadsheet: ' + ss.getName() + '\n';
  } catch (e) {
    message += '❌ Spreadsheet error: ' + e.message + '\n';
  }
  
  try {
    const calendar = CalendarApp.getCalendarById(SHEETS_CONFIG.CALENDAR_ID);
    message += '✅ Calendar: ' + calendar.getName() + '\n';
  } catch (e) {
    message += '❌ Calendar error: ' + e.message + '\n';
  }
  
  try {
    const folder = DriveApp.getFolderById(SHEETS_CONFIG.BOOKINGS_FOLDER_ID);
    message += '✅ Drive folder: ' + folder.getName() + '\n';
  } catch (e) {
    message += '❌ Drive folder error: ' + e.message + '\n';
  }
  
  SpreadsheetApp.getUi().alert(message);
}

// ============================================
// TRIGGER SETUP
// ============================================

/**
 * Create automatic sync trigger
 */
function createSheetsSyncTrigger() {
  // Remove existing
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncCalendarToSheets') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Create new - every 15 minutes
  ScriptApp.newTrigger('syncCalendarToSheets')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  Logger.log('✅ Sync trigger created');
}
