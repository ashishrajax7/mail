/**
 * =========================================================================
 * BRANDCENTRAL MAILER - GOOGLE APPS SCRIPT DATABASE BACKEND
 * =========================================================================
 * 
 * INSTRUCTIONS TO DEPLOY:
 * 1. Open your Google Sheet.
 * 2. Click on "Extensions" > "Apps Script".
 * 3. Delete any default code and paste this ENTIRE code into the editor.
 * 4. Click "Deploy" > "New deployment".
 * 5. Click the gear icon (⚙️) next to "Select type" and choose "Web app".
 * 6. Set the following options:
 *    - Description: BrandCentral Mailer Sync Engine
 *    - Execute as: Me (your Google account)
 *    - Who has access: Anyone  <-- (VERY IMPORTANT!)
 * 7. Click "Deploy", authorize access if prompted, and COPY the "Web app URL"
 *    (looks like https://script.google.com/macros/s/AKfycb.../exec).
 * 8. Paste that Web App URL in your project .env file as:
 *    GOOGLE_SHEET_WEBHOOK_URL="https://script.google.com/macros/s/.../exec"
 * =========================================================================
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Ensure tabs exist
  var emailsSheet = ss.getSheetByName('Emails');
  var templatesSheet = ss.getSheetByName('Templates');
  
  // 1. Fetch Emails
  var emails = [];
  if (emailsSheet && emailsSheet.getLastRow() > 1) {
    var emailData = emailsSheet.getRange(2, 1, emailsSheet.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < emailData.length; i++) {
      var id = emailData[i][0];
      var name = emailData[i][1];
      var email = emailData[i][2];
      if (email && String(email).trim() !== '') {
        emails.push({
          id: id ? String(id) : 'em_' + (i + 1),
          name: name ? String(name) : 'Contact',
          email: String(email).trim()
        });
      }
    }
  }
  
  // 2. Fetch Templates
  var templates = [];
  if (templatesSheet && templatesSheet.getLastRow() > 1) {
    var tplData = templatesSheet.getRange(2, 1, templatesSheet.getLastRow() - 1, 4).getValues();
    for (var j = 0; j < tplData.length; j++) {
      var tId = tplData[j][0];
      var tName = tplData[j][1];
      var tSubject = tplData[j][2];
      var tBody = tplData[j][3];
      if (tName && String(tName).trim() !== '') {
        templates.push({
          id: tId ? String(tId) : 'tpl_' + (j + 1),
          name: String(tName),
          subject: tSubject ? String(tSubject) : '',
          body: tBody ? String(tBody) : ''
        });
      }
    }
  }
  
  var response = {
    status: 'success',
    emails: emails,
    templates: templates
  };
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var payload = {};
  
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid JSON payload' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var actionType = payload.type;
  
  // Action 1: Save All Emails
  if (actionType === 'save_emails') {
    var sheet = ss.getSheetByName('Emails');
    if (!sheet) {
      sheet = ss.insertSheet('Emails');
    }
    sheet.clear();
    // Headers
    sheet.appendRow(['ID', 'Name', 'Email']);
    sheet.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#f1f5f9');
    
    var emailsList = payload.emails || [];
    var rows = [];
    for (var i = 0; i < emailsList.length; i++) {
      var item = emailsList[i];
      rows.push([item.id || ('em_' + (i + 1)), item.name || '', item.email || '']);
    }
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Action 2: Save All Templates
  if (actionType === 'save_templates') {
    var sheet = ss.getSheetByName('Templates');
    if (!sheet) {
      sheet = ss.insertSheet('Templates');
    }
    sheet.clear();
    // Headers
    sheet.appendRow(['ID', 'Name', 'Subject', 'Body']);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#f1f5f9');
    
    var tplList = payload.templates || [];
    var rows = [];
    for (var j = 0; j < tplList.length; j++) {
      var t = tplList[j];
      rows.push([t.id || ('tpl_' + (j + 1)), t.name || '', t.subject || '', t.body || '']);
    }
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 4).setValues(rows);
    }
    return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Action 3: Log Sent Email
  if (actionType === 'log_sent_email') {
    var logSheet = ss.getSheetByName('Sent_Logs');
    if (!logSheet) {
      logSheet = ss.insertSheet('Sent_Logs');
      logSheet.appendRow(['Timestamp', 'Sender Account', 'To Recipient', 'Cc', 'Subject', 'Status']);
      logSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f1f5f9');
    }
    logSheet.appendRow([
      new Date(),
      payload.sender || '',
      payload.to || '',
      payload.cc || '',
      payload.subject || '',
      payload.status || 'SENT'
    ]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action type' }))
    .setMimeType(ContentService.MimeType.JSON);
}
