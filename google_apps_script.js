/**
 * =========================================================================
 * BRANDCENTRAL MAILER - GOOGLE APPS SCRIPT ENGINE (DATABASE & HTTP DISPATCH)
 * =========================================================================
 * 
 * INSTRUCTIONS TO UPDATE DEPLOYMENT:
 * 1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1Xhyx10n3-kCIQpXiFPZrUgXgB_PJiYyxP_vrKiD-RkA/edit
 * 2. Click on "Extensions" > "Apps Script".
 * 3. Delete old code, paste this ENTIRE updated code.
 * 4. Click "Deploy" > "Manage deployments" (or "New deployment").
 * 5. Edit the active deployment (or create new version):
 *    - Version: New version
 *    - Who has access: Anyone  <-- (VERY IMPORTANT!)
 * 6. Click "Deploy" and authorize access if prompted.
 * =========================================================================
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
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
  
  // Action 3: Send Email via Google Cloud API (Never blocked on Render Free Tier!)
  if (actionType === 'send_email') {
    try {
      var to = payload.to;
      var subject = payload.subject || '(No Subject)';
      var body = payload.body || '';
      var fromName = payload.from_name || 'BrandCentral Mailer';
      
      var options = {
        name: fromName
      };
      if (payload.cc) options.cc = payload.cc;
      if (payload.bcc) options.bcc = payload.bcc;
      
      // Attachments support
      if (payload.attachments && payload.attachments.length > 0) {
        var blobs = [];
        for (var a = 0; a < payload.attachments.length; a++) {
          var att = payload.attachments[a];
          var bytes = Utilities.base64Decode(att.base64);
          var blob = Utilities.newBlob(bytes, att.contentType || 'application/octet-stream', att.filename);
          blobs.push(blob);
        }
        options.attachments = blobs;
      }
      
      GmailApp.sendEmail(to, subject, body, options);
      
      // Log Sent Record
      var logSheet = ss.getSheetByName('Sent_Logs');
      if (!logSheet) {
        logSheet = ss.insertSheet('Sent_Logs');
        logSheet.appendRow(['Timestamp', 'From Name', 'To Recipient', 'Cc', 'Subject', 'Status']);
        logSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#f1f5f9');
      }
      logSheet.appendRow([new Date(), fromName, to, payload.cc || '', subject, 'SENT']);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Email sent successfully via Google Engine!' }))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (sendErr) {
      return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: sendErr.toString() }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Action 4: Log Sent Email
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
