/**
 * Artist-Ops 360 - Calendar Sync Engine
 * 
 * Google Apps Script for syncing Google Calendar events to Airtable/Sheets
 * Handles parsing, client lookup, folder creation, and document generation
 * 
 * @author Artist-Ops 360
 * @version 1.0.0
 */

// ============================================
// CONFIGURATION - Edit these values
// ============================================

const CONFIG = {
  // Airtable Configuration
  AIRTABLE_API_KEY: 'YOUR_AIRTABLE_API_KEY',
  AIRTABLE_BASE_ID: 'YOUR_BASE_ID',
  AIRTABLE_ARTISTS_TABLE: 'Artists',
  AIRTABLE_CLIENTS_TABLE: 'Clients',
  AIRTABLE_BOOKINGS_TABLE: 'Bookings',
  
  // Google Calendar
  CALENDAR_ID: 'primary', // or specific calendar ID
  
  // Google Drive
  BOOKINGS_FOLDER_ID: 'YOUR_ROOT_FOLDER_ID', // Parent folder for all event folders
  
  // Document Templates
  PAYMENT_REQUEST_TEMPLATE_ID: 'YOUR_PAYMENT_REQUEST_DOC_ID',
  DEAL_MEMO_TEMPLATE_ID: 'YOUR_DEAL_MEMO_DOC_ID',
  
  // Sync Settings
  SYNC_DAYS_AHEAD: 90, // Look this many days into the future
  EVENT_TITLE_PATTERN: /^(.+)\s*@\s*(.+)$/, // "Artist @ Venue" format
  
  // Hebrew Support
  USE_HEBREW: true,
  DATE_FORMAT: 'dd/MM/yyyy'
};

// ============================================
// MAIN SYNC FUNCTION
// ============================================

/**
 * Main entry point - Run this to sync calendar with database
 * Set up a time-driven trigger to run every 15 minutes
 */
function syncCalendarToDatabase() {
  const now = new Date();
  const futureDate = new Date(now.getTime() + CONFIG.SYNC_DAYS_AHEAD * 24 * 60 * 60 * 1000);
  
  Logger.log(`🚀 Starting sync: ${now.toISOString()} to ${futureDate.toISOString()}`);
  
  const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  const events = calendar.getEvents(now, futureDate);
  
  let processed = 0;
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const event of events) {
    try {
      const result = processCalendarEvent(event);
      processed++;
      
      if (result.created) created++;
      if (result.skipped) skipped++;
      
    } catch (error) {
      errors++;
      Logger.log(`❌ Error processing event "${event.getTitle()}": ${error.message}`);
    }
  }
  
  Logger.log(`\n📊 Sync Complete:`);
  Logger.log(`   Processed: ${processed}`);
  Logger.log(`   Created: ${created}`);
  Logger.log(`   Skipped: ${skipped}`);
  Logger.log(`   Errors: ${errors}`);
  
  return { processed, created, skipped, errors };
}

// ============================================
// EVENT PROCESSING
// ============================================

/**
 * Process a single calendar event
 */
function processCalendarEvent(event) {
  const title = event.getTitle();
  const eventId = event.getId();
  
  // Check if already processed
  if (bookingExistsByCalendarId(eventId)) {
    return { skipped: true, reason: 'Already exists' };
  }
  
  // Parse event title
  const parsed = parseEventTitle(title);
  if (!parsed) {
    Logger.log(`⚠️ Skipping non-matching event: "${title}"`);
    return { skipped: true, reason: 'Title format mismatch' };
  }
  
  Logger.log(`\n📅 Processing: "${title}"`);
  Logger.log(`   Artist: ${parsed.artistName}`);
  Logger.log(`   Venue: ${parsed.venueName}`);
  
  // Lookup artist
  const artist = lookupArtist(parsed.artistName);
  if (!artist) {
    Logger.log(`   ➕ Creating new artist: ${parsed.artistName}`);
    // Create placeholder artist
    const newArtist = createArtist({
      name: parsed.artistName,
      status: 'Active',
      notes: 'Auto-created from calendar - needs completion'
    });
    artist = newArtist;
  }
  
  // Lookup client
  let client = lookupClientByKeyword(parsed.venueName);
  let flagIncomplete = false;
  
  if (!client) {
    Logger.log(`   ➕ Creating new client: ${parsed.venueName}`);
    flagIncomplete = true;
    client = createClient({
      search_keyword: parsed.venueName,
      legal_name: parsed.venueName, // Placeholder
      status: 'Prospect',
      flag_incomplete: true,
      notes: 'Auto-created from calendar - needs legal info'
    });
  } else {
    Logger.log(`   ✅ Found client: ${client.fields.legal_name}`);
  }
  
  // Create Drive folder
  const eventDate = event.getStartTime();
  const folderName = formatFolderName(eventDate, parsed.artistName, parsed.venueName);
  const folder = createEventFolder(folderName);
  
  // Generate documents
  const docs = generateEventDocuments(folder, {
    eventDate: eventDate,
    artist: artist,
    client: client,
    venueName: parsed.venueName,
    fee: artist.fields.base_price || 0
  });
  
  // Copy technical rider if available
  if (artist.fields.technical_rider_url) {
    copyTechnicalRider(artist.fields.technical_rider_url, folder);
  }
  
  // Create booking record
  const booking = createBooking({
    event_date: formatDate(eventDate),
    event_time: formatTime(eventDate),
    calendar_event_id: eventId,
    artist_link: [artist.id],
    client_link: [client.id],
    venue_name: parsed.venueName,
    fee: artist.fields.base_price || 0,
    status: 'Pending',
    payment_status: 'Pending',
    drive_folder_url: folder.getUrl(),
    payment_request_url: docs.paymentRequestUrl,
    deal_memo_url: docs.dealMemoUrl,
    flag_incomplete: flagIncomplete,
    created_by: 'Calendar Sync',
    notes: flagIncomplete ? '⚠️ Client info incomplete - needs manual review' : ''
  });
  
  Logger.log(`   ✅ Booking created: ${booking.id}`);
  Logger.log(`   📁 Folder: ${folder.getUrl()}`);
  
  return { created: true, bookingId: booking.id };
}

/**
 * Parse event title in format "Artist @ Venue"
 */
function parseEventTitle(title) {
  const match = title.match(CONFIG.EVENT_TITLE_PATTERN);
  if (!match) return null;
  
  return {
    artistName: match[1].trim(),
    venueName: match[2].trim()
  };
}

// ============================================
// AIRTABLE OPERATIONS
// ============================================

/**
 * Make authenticated request to Airtable API
 */
function airtableRequest(table, method, payload = null, recordId = null) {
  let url = `https://api.airtable.com/v0/${CONFIG.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}`;
  if (recordId) url += `/${recordId}`;
  
  const options = {
    method: method,
    headers: {
      'Authorization': `Bearer ${CONFIG.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    muteHttpExceptions: true
  };
  
  if (payload) {
    options.payload = JSON.stringify(payload);
  }
  
  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

/**
 * Check if booking exists by calendar event ID
 */
function bookingExistsByCalendarId(calendarEventId) {
  const formula = `{calendar_event_id}="${calendarEventId}"`;
  const url = `https://api.airtable.com/v0/${CONFIG.AIRTABLE_BASE_ID}/${encodeURIComponent(CONFIG.AIRTABLE_BOOKINGS_TABLE)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  const response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': `Bearer ${CONFIG.AIRTABLE_API_KEY}` }
  });
  
  const data = JSON.parse(response.getContentText());
  return data.records && data.records.length > 0;
}

/**
 * Lookup artist by name (fuzzy match)
 */
function lookupArtist(artistName) {
  const formula = `LOWER({name})=LOWER("${artistName.replace(/"/g, '\\"')}")`;
  const url = `https://api.airtable.com/v0/${CONFIG.AIRTABLE_BASE_ID}/${encodeURIComponent(CONFIG.AIRTABLE_ARTISTS_TABLE)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  const response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': `Bearer ${CONFIG.AIRTABLE_API_KEY}` }
  });
  
  const data = JSON.parse(response.getContentText());
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

/**
 * Lookup client by search keyword (partial match)
 */
function lookupClientByKeyword(venueName) {
  // Try exact match first
  let formula = `LOWER({search_keyword})=LOWER("${venueName.replace(/"/g, '\\"')}")`;
  let url = `https://api.airtable.com/v0/${CONFIG.AIRTABLE_BASE_ID}/${encodeURIComponent(CONFIG.AIRTABLE_CLIENTS_TABLE)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  let response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': `Bearer ${CONFIG.AIRTABLE_API_KEY}` }
  });
  
  let data = JSON.parse(response.getContentText());
  if (data.records && data.records.length > 0) {
    return data.records[0];
  }
  
  // Try partial match (venue contains keyword)
  formula = `SEARCH(LOWER({search_keyword}), LOWER("${venueName.replace(/"/g, '\\"')}"))>0`;
  url = `https://api.airtable.com/v0/${CONFIG.AIRTABLE_BASE_ID}/${encodeURIComponent(CONFIG.AIRTABLE_CLIENTS_TABLE)}?filterByFormula=${encodeURIComponent(formula)}`;
  
  response = UrlFetchApp.fetch(url, {
    headers: { 'Authorization': `Bearer ${CONFIG.AIRTABLE_API_KEY}` }
  });
  
  data = JSON.parse(response.getContentText());
  return data.records && data.records.length > 0 ? data.records[0] : null;
}

/**
 * Create new artist record
 */
function createArtist(fields) {
  const result = airtableRequest(CONFIG.AIRTABLE_ARTISTS_TABLE, 'POST', {
    fields: fields
  });
  return result;
}

/**
 * Create new client record
 */
function createClient(fields) {
  const result = airtableRequest(CONFIG.AIRTABLE_CLIENTS_TABLE, 'POST', {
    fields: fields
  });
  return result;
}

/**
 * Create new booking record
 */
function createBooking(fields) {
  const result = airtableRequest(CONFIG.AIRTABLE_BOOKINGS_TABLE, 'POST', {
    fields: fields
  });
  return result;
}

/**
 * Update booking record
 */
function updateBooking(recordId, fields) {
  const result = airtableRequest(CONFIG.AIRTABLE_BOOKINGS_TABLE, 'PATCH', {
    fields: fields
  }, recordId);
  return result;
}

// ============================================
// GOOGLE DRIVE OPERATIONS
// ============================================

/**
 * Create event folder with naming convention
 */
function createEventFolder(folderName) {
  const parentFolder = DriveApp.getFolderById(CONFIG.BOOKINGS_FOLDER_ID);
  
  // Check if folder already exists
  const existing = parentFolder.getFoldersByName(folderName);
  if (existing.hasNext()) {
    return existing.next();
  }
  
  return parentFolder.createFolder(folderName);
}

/**
 * Format folder name: YYYY-MM-DD - Artist Name - Venue
 */
function formatFolderName(date, artistName, venueName) {
  const dateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return `${dateStr} - ${artistName} - ${venueName}`;
}

/**
 * Copy technical rider to event folder
 */
function copyTechnicalRider(riderUrl, destinationFolder) {
  try {
    const fileId = extractFileIdFromUrl(riderUrl);
    if (fileId) {
      const file = DriveApp.getFileById(fileId);
      file.makeCopy('Technical Rider - ' + file.getName(), destinationFolder);
      Logger.log(`   📄 Copied technical rider`);
    }
  } catch (error) {
    Logger.log(`   ⚠️ Could not copy technical rider: ${error.message}`);
  }
}

/**
 * Extract file ID from Drive URL
 */
function extractFileIdFromUrl(url) {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

// ============================================
// DOCUMENT GENERATION
// ============================================

/**
 * Generate all event documents
 */
function generateEventDocuments(folder, data) {
  const paymentRequest = generatePaymentRequest(folder, data);
  const dealMemo = generateDealMemo(folder, data);
  
  return {
    paymentRequestUrl: paymentRequest.getUrl(),
    dealMemoUrl: dealMemo.getUrl()
  };
}

/**
 * Generate Payment Request from template
 */
function generatePaymentRequest(folder, data) {
  const template = DriveApp.getFileById(CONFIG.PAYMENT_REQUEST_TEMPLATE_ID);
  const fileName = `בקשת תשלום - ${data.artist.fields.name} - ${formatDateHebrew(data.eventDate)}`;
  
  const copy = template.makeCopy(fileName, folder);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  
  // Replace placeholders
  const replacements = {
    '{{DATE}}': formatDateHebrew(data.eventDate),
    '{{ARTIST_NAME}}': data.artist.fields.name || '',
    '{{CLIENT_NAME}}': data.client.fields.legal_name || '',
    '{{CLIENT_NAME_HEB}}': data.client.fields.legal_name_hebrew || data.client.fields.legal_name || '',
    '{{BUSINESS_NUMBER}}': data.client.fields.business_number || '',
    '{{BILLING_ADDRESS}}': data.client.fields.billing_address || '',
    '{{VENUE_NAME}}': data.venueName,
    '{{VENUE_ADDRESS}}': data.client.fields.venue_address || '',
    '{{FEE}}': formatCurrency(data.fee),
    '{{PAYMENT_TERMS}}': data.client.fields.payment_terms || 'Net 30',
    '{{INVOICE_NUMBER}}': generateInvoiceNumber(data.eventDate),
    '{{TODAY}}': formatDateHebrew(new Date())
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    body.replaceText(placeholder, value);
  }
  
  doc.saveAndClose();
  
  // Convert to PDF
  const pdf = convertToPdf(copy, folder, fileName);
  
  return pdf;
}

/**
 * Generate Deal Memo from template
 */
function generateDealMemo(folder, data) {
  const template = DriveApp.getFileById(CONFIG.DEAL_MEMO_TEMPLATE_ID);
  const fileName = `הסכם הופעה - ${data.artist.fields.name} - ${formatDateHebrew(data.eventDate)}`;
  
  const copy = template.makeCopy(fileName, folder);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  
  // Replace placeholders
  const replacements = {
    '{{EVENT_DATE}}': formatDateHebrew(data.eventDate),
    '{{EVENT_TIME}}': formatTime(data.eventDate),
    '{{ARTIST_NAME}}': data.artist.fields.name || '',
    '{{CLIENT_NAME}}': data.client.fields.legal_name || '',
    '{{CLIENT_NAME_HEB}}': data.client.fields.legal_name_hebrew || data.client.fields.legal_name || '',
    '{{BUSINESS_NUMBER}}': data.client.fields.business_number || '',
    '{{CLIENT_ADDRESS}}': data.client.fields.billing_address || '',
    '{{CONTACT_NAME}}': data.client.fields.contact_name || '',
    '{{CONTACT_PHONE}}': data.client.fields.contact_phone || '',
    '{{VENUE_NAME}}': data.venueName,
    '{{VENUE_ADDRESS}}': data.client.fields.venue_address || '',
    '{{VENUE_CAPACITY}}': data.client.fields.venue_capacity || '',
    '{{FEE}}': formatCurrency(data.fee),
    '{{DEPOSIT}}': formatCurrency(data.fee * 0.5),
    '{{BALANCE}}': formatCurrency(data.fee * 0.5),
    '{{TODAY}}': formatDateHebrew(new Date())
  };
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    body.replaceText(placeholder, String(value));
  }
  
  doc.saveAndClose();
  
  // Convert to PDF
  const pdf = convertToPdf(copy, folder, fileName);
  
  return pdf;
}

/**
 * Convert document to PDF
 */
function convertToPdf(docFile, folder, name) {
  const blob = docFile.getAs('application/pdf');
  blob.setName(name + '.pdf');
  const pdf = folder.createFile(blob);
  
  // Keep original doc for editing
  // docFile.setTrashed(true);
  
  return pdf;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format date for display (Hebrew locale)
 */
function formatDateHebrew(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), CONFIG.DATE_FORMAT);
}

/**
 * Format date for Airtable
 */
function formatDate(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Format time
 */
function formatTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}

/**
 * Format currency (ILS)
 */
function formatCurrency(amount) {
  return '₪' + Number(amount).toLocaleString('he-IL');
}

/**
 * Generate invoice number based on date
 */
function generateInvoiceNumber(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const random = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `INV-${year}${month}-${random}`;
}

// ============================================
// TRIGGER SETUP
// ============================================

/**
 * Create time-driven trigger for automatic sync
 * Run this once to set up automation
 */
function createSyncTrigger() {
  // Delete existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'syncCalendarToDatabase') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Create new trigger - every 15 minutes
  ScriptApp.newTrigger('syncCalendarToDatabase')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  Logger.log('✅ Sync trigger created - runs every 15 minutes');
}

/**
 * Create calendar change trigger for real-time sync
 */
function createCalendarTrigger() {
  ScriptApp.newTrigger('onCalendarChange')
    .forUserCalendar(CONFIG.CALENDAR_ID)
    .onEventUpdated()
    .create();
  
  Logger.log('✅ Calendar trigger created - runs on event changes');
}

/**
 * Handle calendar change events
 */
function onCalendarChange(e) {
  Logger.log('📅 Calendar change detected');
  syncCalendarToDatabase();
}

// ============================================
// MANUAL OPERATIONS
// ============================================

/**
 * Regenerate documents for existing booking
 */
function regenerateDocuments(bookingId) {
  // Fetch booking
  const booking = airtableRequest(CONFIG.AIRTABLE_BOOKINGS_TABLE, 'GET', null, bookingId);
  
  if (!booking || booking.error) {
    throw new Error('Booking not found');
  }
  
  // Fetch related records
  const artistId = booking.fields.artist_link[0];
  const clientId = booking.fields.client_link[0];
  
  const artist = airtableRequest(CONFIG.AIRTABLE_ARTISTS_TABLE, 'GET', null, artistId);
  const client = airtableRequest(CONFIG.AIRTABLE_CLIENTS_TABLE, 'GET', null, clientId);
  
  // Get or create folder
  const folder = DriveApp.getFolderById(extractFileIdFromUrl(booking.fields.drive_folder_url));
  
  // Generate new documents
  const docs = generateEventDocuments(folder, {
    eventDate: new Date(booking.fields.event_date),
    artist: artist,
    client: client,
    venueName: booking.fields.venue_name,
    fee: booking.fields.fee
  });
  
  // Update booking with new URLs
  updateBooking(bookingId, {
    payment_request_url: docs.paymentRequestUrl,
    deal_memo_url: docs.dealMemoUrl
  });
  
  Logger.log(`✅ Documents regenerated for booking ${bookingId}`);
  return docs;
}

/**
 * Test the configuration
 */
function testConfiguration() {
  Logger.log('🔧 Testing configuration...\n');
  
  // Test Calendar access
  try {
    const calendar = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
    Logger.log(`✅ Calendar: ${calendar.getName()}`);
  } catch (e) {
    Logger.log(`❌ Calendar error: ${e.message}`);
  }
  
  // Test Drive folder
  try {
    const folder = DriveApp.getFolderById(CONFIG.BOOKINGS_FOLDER_ID);
    Logger.log(`✅ Drive folder: ${folder.getName()}`);
  } catch (e) {
    Logger.log(`❌ Drive folder error: ${e.message}`);
  }
  
  // Test Airtable connection
  try {
    const url = `https://api.airtable.com/v0/${CONFIG.AIRTABLE_BASE_ID}/${encodeURIComponent(CONFIG.AIRTABLE_ARTISTS_TABLE)}?maxRecords=1`;
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': `Bearer ${CONFIG.AIRTABLE_API_KEY}` },
      muteHttpExceptions: true
    });
    const data = JSON.parse(response.getContentText());
    if (data.error) {
      Logger.log(`❌ Airtable error: ${data.error.message}`);
    } else {
      Logger.log(`✅ Airtable connected - ${data.records.length} artists found`);
    }
  } catch (e) {
    Logger.log(`❌ Airtable error: ${e.message}`);
  }
  
  // Test templates
  try {
    const paymentTemplate = DriveApp.getFileById(CONFIG.PAYMENT_REQUEST_TEMPLATE_ID);
    Logger.log(`✅ Payment template: ${paymentTemplate.getName()}`);
  } catch (e) {
    Logger.log(`❌ Payment template error: ${e.message}`);
  }
  
  try {
    const memoTemplate = DriveApp.getFileById(CONFIG.DEAL_MEMO_TEMPLATE_ID);
    Logger.log(`✅ Deal memo template: ${memoTemplate.getName()}`);
  } catch (e) {
    Logger.log(`❌ Deal memo template error: ${e.message}`);
  }
  
  Logger.log('\n🔧 Configuration test complete');
}
