/**
 * sheets.gs — приём заявок с сайта «Сайтик» в конкретную Google Таблицу.
 *
 * Таблица:
 *   https://docs.google.com/spreadsheets/d/1gVCfz4RpoJ-sUxKdmLAJf9tE-mhsCpgLsrBvMGkR2Hw/edit
 * Лист: «Лист1», шапка уже стоит:
 *   номер | дата | имя | контакт | тип | задача | бюджет | срок | описание | ссылка | страница
 *
 * Этот файл сайт не подключает. Его нужно один раз вставить в Apps Script
 * этой таблицы и опубликовать как веб-приложение. Пошагово — в README.
 */

var SPREADSHEET_ID = "1gVCfz4RpoJ-sUxKdmLAJf9tE-mhsCpgLsrBvMGkR2Hw";
var SHEET_NAME = "Лист1";
// Почта, указанная на сайте (assets/js/site.config.js → email).
// Apps Script работает отдельно от сайта, поэтому при смене адреса обновите оба файла.
var NOTIFICATION_EMAIL = "andreydragon22813@gmail.com";
var HEADERS = [
  "номер",
  "дата",
  "имя",
  "контакт",
  "тип",
  "задача",
  "бюджет",
  "срок",
  "описание",
  "ссылка",
  "страница"
];

function doGet() {
  return json_({
    ok: true,
    service: "saytik-orders",
    spreadsheetId: SPREADSHEET_ID,
    sheet: SHEET_NAME,
    hint: "Таблица подключена. Этот адрес вставьте в site.config.js → sheetsWebhook."
  });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  var data;
  try {
    data = parseBody_(e);
    var sheet = getSheet_();
    ensureHeader_(sheet);
    sheet.appendRow(rowFrom_(data));
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    lock.releaseLock();
  }

  // Только после успешной записи: письмо без данных клиента, таблицу не меняем.
  // Ошибка почты не должна превращать сохранённую заявку в «неотправленную»:
  // иначе посетитель повторит отправку и появится дубликат строки.
  var notificationSent = true;
  try {
    MailApp.sendEmail(NOTIFICATION_EMAIL, "Новая заявка", "Пришла новая заявка.");
  } catch (error) {
    notificationSent = false;
    Logger.log("Не удалось отправить уведомление о заявке: " + error);
  }
  return json_({ ok: true, number: data.number || "", notificationSent: notificationSent });
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error("пустое тело запроса");
  }
  var raw = String(e.postData.contents);
  try {
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("не объект");
    return parsed;
  } catch (error) {
    throw new Error("тело запроса не JSON");
  }
}

function getSpreadsheet_() {
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (error) { ss = null; }
  if (ss && ss.getId() === SPREADSHEET_ID) return ss;
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (!sheet) throw new Error("в таблице нет ни одного листа");
  return sheet;
}

function ensureHeader_(sheet) {
  var last = Math.max(sheet.getLastRow(), 1);
  var look = Math.min(Math.max(last, 1), 5);
  var values = sheet.getRange(1, 1, look, HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).toLowerCase() === HEADERS[0]) return;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
}

function rowFrom_(data) {
  data = data || {};
  return [
    data.number || "",
    data.created || "",
    data.name || "",
    data.contact || "",
    data.kind || "",
    data.type || "",
    data.budget || "",
    data.deadline || "",
    data.about || "",
    data.link || "",
    data.page || ""
  ];
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
