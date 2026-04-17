// ============================================
// HOME BUDGET TRACKER V2 — Google Apps Script
// ============================================
// SETUP INSTRUCTIONS:
//   1. Open Google Sheets → Extensions → Apps Script
//   2. Replace ALL existing code with this file
//   3. Run "setupHeadersV2" once (see Step 4 below)
//   4. Deploy → Manage deployments → Edit → New version → Deploy
//      Execute as: Me | Who has access: Anyone
// ============================================

var EXPENSES_SHEET = 'Expenses';
var PERSONAL_SHEET = 'PersonalExpenses';

// ============================================
// ROUTER
// ============================================
function doPost(e) {
  try {
    var raw  = e.postData ? e.postData.contents : '{}';
    var data = JSON.parse(raw);
    var action = (data.action || '').toString();

    switch (action) {
      case 'addEntry':    return handleAddEntry(data);
      case 'addPersonal': return handleAddPersonal(data);
      case 'getEntries':  return handleGetEntries(data);
      case 'updateEntry': return handleUpdateEntry(data);
      case 'deleteEntry': return handleDeleteEntry(data);
      default:            return respond(false, 'Unknown action: ' + action);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return respond(false, 'Server error: ' + err.toString());
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'API is running', version: '2.0' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// ACTION: ADD COMMON EXPENSE
// Columns (V2): ID | Month | Date | Category | Remark | Smruti Amt | Sajhni Amt | Total
// ============================================
function handleAddEntry(data) {
  validateRequired(data, ['id', 'date', 'category', 'user', 'amount']);
  var amount = toPositiveFloat(data.amount);
  var sheet  = getOrCreateSheet(EXPENSES_SHEET);
  ensureV2Schema(sheet);

  var month      = deriveMonth(data.date);
  var smrutiAmt  = (data.user === 'Smruti') ? amount : '';
  var sajhniAmt  = (data.user === 'Sajhni') ? amount : '';
  var remark     = sanitiseRemark(data.remark);

  sheet.appendRow([data.id, month, data.date, data.category, remark, smrutiAmt, sajhniAmt, amount]);
  return respond(true, 'Entry added');
}

// ============================================
// ACTION: ADD PERSONAL EXPENSE
// Columns: ID | Month | Date | Category | Remark | Amount | User
// ============================================
function handleAddPersonal(data) {
  validateRequired(data, ['id', 'date', 'category', 'user', 'amount']);
  var amount = toPositiveFloat(data.amount);
  var sheet  = getOrCreateSheet(PERSONAL_SHEET);
  ensurePersonalSchema(sheet);

  var month  = deriveMonth(data.date);
  var remark = sanitiseRemark(data.remark);

  sheet.appendRow([data.id, month, data.date, data.category, remark, amount, data.user]);
  return respond(true, 'Personal entry added');
}

// ============================================
// ACTION: GET ENTRIES (date-range filtered)
// ============================================
function handleGetEntries(data) {
  var type      = (data.type === 'personal') ? 'personal' : 'common';
  var sheetName = (type === 'personal') ? PERSONAL_SHEET : EXPENSES_SHEET;
  var sheet     = getOrCreateSheet(sheetName);

  if (sheet.getLastRow() <= 1) {
    return respondEntries([]);
  }

  var isV2    = detectV2Schema(sheet);
  var allData = sheet.getDataRange().getValues();
  var rows    = allData.slice(1); // skip header

  var fromDate = data.dateFrom ? parseMMDDYYYY(data.dateFrom) : null;
  var toDate   = data.dateTo   ? parseMMDDYYYY(data.dateTo)   : null;

  // Normalise toDate to end of day
  if (toDate) {
    toDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59);
  }

  var entries = [];
  for (var i = 0; i < rows.length; i++) {
    var row   = rows[i];
    var entry = mapRow(row, type, isV2);

    // Date filter
    if (entry.date) {
      var rowDate = parseMMDDYYYY(entry.date);
      if (fromDate && rowDate && rowDate < fromDate) continue;
      if (toDate   && rowDate && rowDate > toDate)   continue;
    }

    entries.push(entry);
  }

  entries.reverse(); // newest first
  return respondEntries(entries);
}

// ============================================
// ACTION: UPDATE ENTRY BY ID
// ============================================
function handleUpdateEntry(data) {
  if (!data.id)   return respond(false, 'Missing: id');
  if (!data.type) return respond(false, 'Missing: type');

  var amount    = toPositiveFloat(data.amount);
  var sheetName = (data.type === 'personal') ? PERSONAL_SHEET : EXPENSES_SHEET;
  var sheet     = getOrCreateSheet(sheetName);
  var rowIndex  = findRowById(sheet, data.id);

  if (rowIndex === -1) return respond(false, 'Entry not found: ' + data.id);

  var month  = deriveMonth(data.date);
  var remark = sanitiseRemark(data.remark);

  if (data.type === 'personal') {
    // ID | Month | Date | Category | Remark | Amount | User
    sheet.getRange(rowIndex, 1, 1, 7).setValues([[
      data.id, month, data.date, data.category, remark, amount, data.user
    ]]);
  } else {
    var smrutiAmt = (data.user === 'Smruti') ? amount : '';
    var sajhniAmt = (data.user === 'Sajhni') ? amount : '';
    // ID | Month | Date | Category | Remark | Smruti | Sajhni | Total
    sheet.getRange(rowIndex, 1, 1, 8).setValues([[
      data.id, month, data.date, data.category, remark, smrutiAmt, sajhniAmt, amount
    ]]);
  }

  return respond(true, 'Entry updated');
}

// ============================================
// ACTION: DELETE ENTRY BY ID
// ============================================
function handleDeleteEntry(data) {
  if (!data.id)   return respond(false, 'Missing: id');
  if (!data.type) return respond(false, 'Missing: type');

  var sheetName = (data.type === 'personal') ? PERSONAL_SHEET : EXPENSES_SHEET;
  var sheet     = getOrCreateSheet(sheetName);
  var rowIndex  = findRowById(sheet, data.id);

  if (rowIndex === -1) return respond(false, 'Entry not found: ' + data.id);

  sheet.deleteRow(rowIndex);
  return respond(true, 'Entry deleted');
}

// ============================================
// SCHEMA HELPERS
// ============================================

/**
 * Auto-detect V1 vs V2 schema.
 * V2 has 'ID' in the first header cell.
 * V1 has 'Month' in the first header cell.
 */
function detectV2Schema(sheet) {
  if (sheet.getLastRow() < 1) return true; // empty = treat as V2
  var firstHeader = sheet.getRange(1, 1).getValue().toString().trim();
  return (firstHeader === 'ID');
}

/**
 * Ensure the Expenses sheet is in V2 schema.
 * If it's V1, auto-migrate (insert ID column, backfill IDs).
 */
function ensureV2Schema(sheet) {
  if (detectV2Schema(sheet)) return; // already V2

  // V1 → V2 migration: insert column A
  sheet.insertColumnBefore(1);

  // Backfill IDs for existing rows (skip header at row 1)
  var lastRow = sheet.getLastRow();
  for (var i = 2; i <= lastRow; i++) {
    sheet.getRange(i, 1).setValue('legacy-' + i);
  }

  // Update header
  sheet.getRange(1, 1).setValue('ID');

  // Re-style header
  styleHeader(sheet, 8, '#059669');
  sheet.hideColumns(1);
  Logger.log('Auto-migrated Expenses sheet from V1 to V2.');
}

/**
 * Ensure the PersonalExpenses sheet has the correct headers.
 */
function ensurePersonalSchema(sheet) {
  if (sheet.getLastRow() >= 1) {
    var firstHeader = sheet.getRange(1, 1).getValue().toString().trim();
    if (firstHeader === 'ID') return; // already set up
  }
  sheet.getRange(1, 1, 1, 7).setValues([['ID', 'Month', 'Date', 'Category', 'Remark', 'Amount', 'User']]);
  styleHeader(sheet, 7, '#7C3AED');
  sheet.setFrozenRows(1);
  sheet.hideColumns(1);
}

/**
 * Map a raw sheet row to a JS object.
 * Handles both V1 (7 cols, no ID) and V2 (8 cols, ID in col 0).
 */
function mapRow(row, type, isV2) {
  if (type === 'personal') {
    // Personal sheet is always V2: ID | Month | Date | Category | Remark | Amount | User
    return {
      id:       isV2 ? (row[0] || '').toString() : '',
      month:    isV2 ? row[1] : row[0],
      date:     isV2 ? row[2] : row[1],
      category: isV2 ? row[3] : row[2],
      remark:   isV2 ? row[4] : row[3],
      amount:   isV2 ? row[5] : row[4],
      user:     isV2 ? row[6] : row[5]
    };
  } else {
    if (isV2) {
      // V2: ID | Month | Date | Category | Remark | Smruti | Sajhni | Total
      return {
        id:           (row[0] || '').toString(),
        month:        row[1],
        date:         (row[2] || '').toString(),
        category:     (row[3] || '').toString(),
        remark:       (row[4] || '').toString(),
        smrutiAmount: row[5],
        sajhniAmount: row[6],
        total:        row[7]
      };
    } else {
      // V1: Month | Date | Category | Remark | Smruti | Sajhni | Total (no ID)
      return {
        id:           '',
        month:        row[0],
        date:         (row[1] || '').toString(),
        category:     (row[2] || '').toString(),
        remark:       (row[3] || '').toString(),
        smrutiAmount: row[4],
        sajhniAmount: row[5],
        total:        row[6]
      };
    }
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function getOrCreateSheet(name) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function findRowById(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) { // skip header at index 0
    if (data[i][0] && data[i][0].toString() === id.toString()) {
      return i + 1; // sheet rows are 1-indexed
    }
  }
  return -1;
}

function deriveMonth(dateStr) {
  var d = parseMMDDYYYY(dateStr);
  if (!d) return '';
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMMM yyyy');
}

function parseMMDDYYYY(str) {
  if (!str) return null;
  var parts = str.toString().split('/');
  if (parts.length !== 3) return null;
  var m = parseInt(parts[0]), d = parseInt(parts[1]), y = parseInt(parts[2]);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
  return new Date(y, m - 1, d);
}

function sanitiseRemark(remark) {
  return ((remark || '').toString().trim()).slice(0, 100);
}

function toPositiveFloat(val) {
  var n = parseFloat(val);
  if (isNaN(n) || n <= 0) throw new Error('Invalid amount: must be a positive number');
  return Math.round(n * 100) / 100; // round to 2 decimal places
}

function validateRequired(data, fields) {
  fields.forEach(function(f) {
    if (data[f] === undefined || data[f] === null || data[f] === '') {
      throw new Error('Missing required field: ' + f);
    }
  });
}

function respond(success, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function respondEntries(entries) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, entries: entries }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// SETUP — Run once after deploying V2
// ============================================
function setupHeadersV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- Expenses Sheet ----
  var expSheet = getOrCreateSheet(EXPENSES_SHEET);
  ensureV2Schema(expSheet); // auto-migrate if needed
  expSheet.getRange(1, 1, 1, 8).setValues([['ID', 'Month', 'Date', 'Category', 'Remark', 'Smruti Amount', 'Sajhni Amount', 'Total']]);
  styleHeader(expSheet, 8, '#059669');
  expSheet.getRange('F:H').setNumberFormat('₹#,##0.00');
  expSheet.setFrozenRows(1);
  expSheet.autoResizeColumns(1, 8);
  expSheet.hideColumns(1);

  // ---- Personal Expenses Sheet ----
  var perSheet = getOrCreateSheet(PERSONAL_SHEET);
  ensurePersonalSchema(perSheet);
  perSheet.getRange(1, 1, 1, 7).setValues([['ID', 'Month', 'Date', 'Category', 'Remark', 'Amount', 'User']]);
  styleHeader(perSheet, 7, '#7C3AED');
  perSheet.getRange('F:F').setNumberFormat('₹#,##0.00');
  perSheet.setFrozenRows(1);
  perSheet.autoResizeColumns(1, 7);
  perSheet.hideColumns(1);

  SpreadsheetApp.getUi().alert(
    '✅ V2 Setup Complete!\n\n' +
    '"Expenses" and "PersonalExpenses" sheets are ready.\n\n' +
    'IMPORTANT: Redeploy as a NEW VERSION:\n' +
    'Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy'
  );
}

function styleHeader(sheet, cols, color) {
  var range = sheet.getRange(1, 1, 1, cols);
  range.setFontWeight('bold');
  range.setFontColor('#FFFFFF');
  range.setBackground(color);
  range.setHorizontalAlignment('center');
  range.setFontSize(11);
}
