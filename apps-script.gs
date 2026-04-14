// ============================================
// HOME BUDGET TRACKER — Google Apps Script
// ============================================
// HOW TO DEPLOY:
// 1. Open Google Sheets → Extensions → Apps Script
// 2. Paste this entire file, replacing any existing code
// 3. Run "setupHeaders" once to format the sheet
// 4. Deploy → New deployment → Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 5. Copy the Web App URL into the app settings
// ============================================

/**
 * Handles POST requests from the PWA.
 * Expected JSON body:
 *   { date, category, remark, user, amount }
 */
function doPost(e) {
  try {
    // Parse JSON body
    var raw  = e.postData ? e.postData.contents : '';
    var data = JSON.parse(raw);

    // ---- Validate required fields ----
    if (!data.date)     return respond(false, 'Missing field: date');
    if (!data.category) return respond(false, 'Missing field: category');
    if (!data.user)     return respond(false, 'Missing field: user');
    if (data.amount === undefined || data.amount === null || data.amount === '') {
      return respond(false, 'Missing field: amount');
    }

    var amount = parseFloat(data.amount);
    if (isNaN(amount) || amount <= 0) {
      return respond(false, 'Invalid amount: must be a positive number');
    }

    // ---- Derive Month from Date (MM/DD/YYYY) ----
    var parts   = data.date.split('/');
    var dateObj = new Date(
      parseInt(parts[2]),      // year
      parseInt(parts[0]) - 1, // month (0-indexed)
      parseInt(parts[1])       // day
    );
    var month = Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MMMM yyyy');

    // ---- Map amounts to correct columns ----
    var smrutiAmount = (data.user === 'Smruti') ? amount : '';
    var sajhniAmount = (data.user === 'Sajhni') ? amount : '';
    var total        = amount;

    // ---- Remark: trim & cap at 100 chars ----
    var remark = (data.remark || '').toString().trim().slice(0, 100);

    // ---- Write row to sheet ----
    // Column order: Month | Date | Category | Remark | Smruti Amount | Sajhni Amount | Total
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      month,
      data.date,
      data.category,
      remark,
      smrutiAmount,
      sajhniAmount,
      total
    ]);

    return respond(true, 'Entry saved successfully');

  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return respond(false, 'Server error: ' + err.toString());
  }
}

/**
 * Handles GET requests (used by the Test Connection button).
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'API is running', version: '1.0' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Helper: create standardised JSON response.
 */
function respond(success, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: success, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * RUN THIS ONCE before using the app.
 * Sets up column headers with formatting.
 */
function setupHeaders() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  // Rename sheet tab
  sheet.setName('Expenses');

  // Set headers
  var headers = [['Month', 'Date', 'Category', 'Remark', 'Smruti Amount', 'Sajhni Amount', 'Total']];
  sheet.getRange(1, 1, 1, 7).setValues(headers);

  // Style header row
  var headerRange = sheet.getRange(1, 1, 1, 7);
  headerRange.setFontWeight('bold');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setBackground('#059669'); // emerald green
  headerRange.setHorizontalAlignment('center');
  headerRange.setFontSize(11);

  // Auto-resize columns
  sheet.autoResizeColumns(1, 7);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Number format for amount columns (5=Smruti, 6=Sajhni, 7=Total)
  sheet.getRange('E:G').setNumberFormat('₹#,##0.00');

  SpreadsheetApp.getUi().alert(
    '✅ Setup Complete!\n\n' +
    'Headers are ready. Now deploy this script as a Web App:\n' +
    'Deploy → New deployment → Web App\n' +
    'Execute as: Me | Who has access: Anyone'
  );
}
