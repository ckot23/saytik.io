#!/usr/bin/env node
"use strict";

// Имитируем сервисы Apps Script: реальную таблицу и почтовый ящик не трогаем.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "sheets.gs"), "utf8");
const siteEmail = require(path.join(root, "assets/js/site.config.js")).email;

function request(body, options = {}) {
  const rows = [];
  const mail = [];
  const events = [];
  const logs = [];
  const sheet = {
    getLastRow: () => 1,
    getRange: () => ({ getValues: () => [["номер"]] }),
    appendRow(row) {
      if (options.appendError) throw new Error("запись не удалась");
      rows.push(Array.from(row));
      events.push("saved");
    }
  };
  const spreadsheet = {
    getId: () => "1gVCfz4RpoJ-sUxKdmLAJf9tE-mhsCpgLsrBvMGkR2Hw",
    getSheetByName(name) {
      assert.equal(name, "Лист1");
      return sheet;
    }
  };
  const services = {
    LockService: {
      getScriptLock: () => ({
        waitLock: () => events.push("locked"),
        releaseLock: () => events.push("unlocked")
      })
    },
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    MailApp: {
      sendEmail(to, subject, text) {
        events.push("mail");
        if (options.mailError) throw new Error("почта недоступна");
        mail.push({ to, subject, text });
      }
    },
    Logger: { log: (message) => logs.push(message) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput(text) {
        return { text, setMimeType() { return this; } };
      }
    }
  };
  vm.createContext(services);
  vm.runInContext(source, services);
  const result = services.doPost({ postData: { contents: body } });
  return { response: JSON.parse(result.text), rows, mail, events, logs };
}

const payload = {
  number: "ST-20261010-1234",
  created: "10.10.2026 12:00",
  name: "Клиент",
  contact: "+79050000000",
  kind: "телефон",
  type: "Лендинг",
  budget: "15 000 ₽",
  deadline: "5 дней",
  about: "Сайт для бизнеса",
  link: "https://example.com",
  page: "https://saytik.io/order.html"
};

const success = request(JSON.stringify(payload));
assert.deepEqual(success.response, {
  ok: true, number: payload.number, notificationSent: true
});
assert.deepEqual(success.rows, [[
  payload.number, payload.created, payload.name, payload.contact, payload.kind,
  payload.type, payload.budget, payload.deadline, payload.about, payload.link, payload.page
]]);
assert.deepEqual(success.mail, [{
  to: siteEmail, subject: "Новая заявка", text: "Пришла новая заявка."
}]);
assert.deepEqual(success.events, ["locked", "saved", "unlocked", "mail"]);

const invalid = request("не JSON");
assert.equal(invalid.response.ok, false);
assert.equal(invalid.rows.length, 0);
assert.equal(invalid.mail.length, 0);
assert.deepEqual(invalid.events, ["locked", "unlocked"]);

const writeFailure = request(JSON.stringify(payload), { appendError: true });
assert.equal(writeFailure.response.ok, false);
assert.equal(writeFailure.mail.length, 0);
assert.equal(writeFailure.rows.length, 0);

const mailFailure = request(JSON.stringify(payload), { mailError: true });
assert.deepEqual(mailFailure.response, {
  ok: true, number: payload.number, notificationSent: false
});
assert.equal(mailFailure.rows.length, 1);
assert.equal(mailFailure.mail.length, 0);
assert.match(mailFailure.logs[0], /Не удалось отправить уведомление/);

console.log("Apps Script: запись и короткое письмо, ошибки записи и почты — ok");
