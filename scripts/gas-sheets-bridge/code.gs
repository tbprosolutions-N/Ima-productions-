/**
 * Google Apps Script: NPC Sheets — Data Warehouse backup.
 * Deploy as Web app: Execute as "Me", Who has access: "Anyone".
 * Copy the Web app URL into Supabase secrets as GAS_WEBHOOK_URL.
 *
 * doPost(e): Accepts JSON { spreadsheetId?, sheets: { אירועים, לקוחות, אמנים, פיננסים } }.
 * Full snapshot overwrite: each sheet is cleared and rewritten with setValues() (no append).
 * - If spreadsheetId is provided: opens that spreadsheet and overwrites the four sheets (creates tabs if missing).
 * - If not: creates a new spreadsheet, adds the four tabs, writes data, returns spreadsheetId/Url.
 * Returns JSON: { ok: true, spreadsheetId?, spreadsheetUrl?, counts? } or { ok: false, error: string }.
 */

var SHEET_NAMES = ['אירועים', 'לקוחות', 'אמנים', 'פיננסים'];

function doPost(e) {
  var out = { ok: false, error: '' };
  try {
    if (!e || !e.postData || !e.postData.contents) {
      out.error = 'Missing POST body';
      return jsonResponse(out, 400);
    }
    var body = JSON.parse(e.postData.contents);
    var spreadsheetId = body.spreadsheetId && String(body.spreadsheetId).trim();
    var sheets = body.sheets && typeof body.sheets === 'object' ? body.sheets : null;
    if (!sheets) {
      out.error = 'Missing sheets object';
      return jsonResponse(out, 400);
    }

    var ss;
    var created = false;
    if (spreadsheetId) {
      ss = SpreadsheetApp.openById(spreadsheetId);
      if (!ss) {
        out.error = 'Spreadsheet not found: ' + spreadsheetId;
        return jsonResponse(out, 404);
      }
    } else {
      ss = SpreadsheetApp.create('NPC Sync — ' + new Date().toISOString().slice(0, 10));
      created = true;
      spreadsheetId = ss.getId();
    }

    var counts = { events: 0, clients: 0, artists: 0, expenses: 0 };
    for (var i = 0; i < SHEET_NAMES.length; i++) {
      var name = SHEET_NAMES[i];
      var data = sheets[name];
      if (!data || !Array.isArray(data)) continue;
      var sheet = getOrCreateSheet(ss, name);
      sheet.clear();
      if (data.length > 0) {
        var values = data.map(function (row) {
          return Array.isArray(row) ? row.map(function (cell) { return cell != null ? String(cell) : ''; }) : [];
        });
        sheet.getRange(1, 1, values.length, Math.max.apply(null, values.map(function (r) { return r.length; }))).setValues(values);
        sheet.getRange(1, 1, values.length, Math.max.apply(null, values.map(function (r) { return r.length; }))).setNumberFormat('@'); // treat as text where needed; USER_ENTERED is default for setValues in some contexts
      }
      var key = name === 'אירועים' ? 'events' : name === 'לקוחות' ? 'clients' : name === 'אמנים' ? 'artists' : 'expenses';
      var headerRows = (data.length >= 2 && data[0].length === data[1].length) ? 2 : 1;
      counts[key] = Math.max(0, data.length - headerRows);
    }

    out.ok = true;
    if (created) {
      out.spreadsheetId = spreadsheetId;
      out.spreadsheetUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit';
    }
    out.counts = counts;
    return jsonResponse(out, 200);
  } catch (err) {
    out.error = err.message || String(err);
    return jsonResponse(out, 500);
  }
}

function getOrCreateSheet(ss, title) {
  var sheet = ss.getSheetByName(title);
  if (sheet) return sheet;
  sheet = ss.insertSheet(title);
  return sheet;
}

function jsonResponse(obj, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
