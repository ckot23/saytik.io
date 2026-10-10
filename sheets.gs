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
  try {
    var data = parseBody_(e);
    var sheet = getSheet_();
    ensureHeader_(sheet);
    sheet.appendRow(rowFrom_(data));
    // Направить письмо с уведомлением о новом заказе
    try {
      MailApp.sendEmail({
        to: "andreydragon22813@gmail.com",
        subject: "Новая заявка " + (data.number || ""),
        textBody: "Новая заявка с сайта Сайтик\n\n" +
          "Номер: " + (data.number || "") + "\n" +
          "Имя: " + (data.name || "") + "\n" +
          "Контакт: " + (data.contact || "") + "\n" +
          "Тип: " + (data.type || "") + "\n" +
          "Бюджет: " + (data.budget || "") + "\n" +
          "Срок: " + (data.deadline || "") + "\n" +
          "О проекте: " + (data.about || "") + "\n" +
          "Ссылка: " + (data.link || "") + "\n" +
          "Дата получения: " + (data.created || "")
      });
    } catch (emailError) {
      Logger.log("Ошибка отправки письма: " + emailError);
    }
    return json_({ ok: true, number: data.number || "" });
  } catch (error) {
    return json_({ ok: false, error: String(error && error.message ? error.message : error) });
  } finally {
    lock.releaseLock();
  }
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
