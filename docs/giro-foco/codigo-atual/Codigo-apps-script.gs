// Código atual do Apps Script vinculado à planilha "Giro foco - Planilha/nuvem"
// (Extensões -> Apps Script). Copiado pelo usuário em 19/11/2026, sem alterações.

// COLE ESTE CÓDIGO NO EXTENSÕES -> APPS SCRIPT DA SUA PLANILHA GOOGLE:
function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty("GIRO_CDA_CLOUD_STATE") || "{}";
  return ContentService.createTextOutput(raw).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = e.postData ? e.postData.contents : "{}";
    PropertiesService.getScriptProperties().setProperty("GIRO_CDA_CLOUD_STATE", body);
    // Também salva backup automático na aba da planilha para auditoria:
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      var sheet = ss.getSheetByName("Nuvem_Giro") || ss.insertSheet("Nuvem_Giro");
      sheet.getRange("A1").setValue("Última Sincronização:");
      sheet.getRange("B1").setValue(new Date());
      sheet.getRange("A2").setValue(body.substring(0, 45000));
    }
    return ContentService.createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
