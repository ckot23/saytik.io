#!/usr/bin/env node
"use strict";
/* ============================================================================
   tests/order.js — проверки страницы заявки.

   Запуск:  node tests/order.js
   Всё считается в Node, без браузера и без сети: проверяем чистые функции
   из assets/js/order.js — определение контакта, сборку текста, экранирование,
   ссылки-фолбэки и отказ, когда токен не задан.
   ========================================================================= */

const path = require("path");

/* Настройки читаем первыми: order.js берёт globalThis.SAYTIK при загрузке,
   поэтому подключать его раньше нельзя — иначе он увидит пустой объект. */
globalThis.SAYTIK = require(path.join(__dirname, "..", "assets", "js", "site.config.js"));
const Order = require(path.join(__dirname, "..", "assets", "js", "order.js"));

let passed = 0;
const failed = [];

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (error) {
    failed.push(name + " — " + error.message);
    console.log("  FAIL " + name + "\n       " + error.message);
  }
}

function eq(actual, expected, hint) {
  if (actual !== expected) {
    throw new Error(
      "ожидалось " + JSON.stringify(expected) +
      ", получено " + JSON.stringify(actual) + (hint ? " (" + hint + ")" : "")
    );
  }
}

console.log("\nКонтакт: телефон, почта, Telegram");

check("телефон с +7 и пробелами", () => {
  eq(Order.detectContact("+7 (900) 000-00-00").kind, "phone");
});
check("телефон без плюса", () => {
  eq(Order.detectContact("79000000000").kind, "phone");
});
check("номер из одних цифр не путается с Telegram", () => {
  const result = Order.detectContact("79000000000");
  eq(result.kind, "phone", "11 цифр — это телефон, а не юзернейм");
});
check("телефон с пробелами и дефисами", () => {
  eq(Order.detectContact("8-900-000-00-00").kind, "phone");
});
check("короткий номер отклоняется", () => {
  eq(Order.detectContact("12345"), null, "5 цифр — это не телефон");
});
check("почта", () => {
  eq(Order.detectContact("ivan@mail.ru").kind, "email");
});
check("почта с поддоменом и точкой в имени", () => {
  eq(Order.detectContact("ivan.petrov@yandex.ru").kind, "email");
});
check("почта без домена отклоняется", () => {
  eq(Order.detectContact("ivan@"), null);
});
check("Telegram с @", () => {
  eq(Order.detectContact("@ivan_petrov").kind, "telegram");
});
check("Telegram без @ тоже узнаётся", () => {
  eq(Order.detectContact("ivan_petrov").kind, "telegram");
});
check("слишком короткий юзернейм отклоняется", () => {
  eq(Order.detectContact("@abc"), null, "минимум 4 символа");
});
check("пустая строка", () => {
  eq(Order.detectContact(""), null);
});
check("пробелы обрезаются", () => {
  eq(Order.detectContact("   +79000000000   ").kind, "phone");
});
check("чепуха отклоняется", () => {
  eq(Order.detectContact("позвоните мне завтра"), null);
});

console.log("\nТекст заявки");

const sample = {
  number: "ST-20261008-1234",
  name: "Иван",
  contact: "+7 900 000-00-00",
  kind: "phone",
  kindLabel: "телефон",
  type: "Лендинг под рекламу или акцию",
  budget: "30 000 – 60 000 ₽",
  deadline: "Как можно быстрее",
  about: "Делаем ремонт квартир",
  link: "https://example.com",
  createdText: "08.10.2026 14:30"
};

check("в тексте есть номер, имя и контакт", () => {
  const text = Order.buildText(sample);
  if (!text.includes("ST-20261008-1234")) throw new Error("нет номера заявки");
  if (!text.includes("Иван")) throw new Error("нет имени");
  if (!text.includes("+7 900 000-00-00")) throw new Error("нет контакта");
  if (!text.includes("телефон")) throw new Error("не указан тип контакта");
});
check("в тексте есть бюджет, срок и описание", () => {
  const text = Order.buildText(sample);
  if (!text.includes("30 000 – 60 000 ₽")) throw new Error("нет бюджета");
  if (!text.includes("Как можно быстрее")) throw new Error("нет срока");
  if (!text.includes("Делаем ремонт квартир")) throw new Error("нет описания");
});
check("пустое описание не оставляет пустых секций", () => {
  const text = Order.buildText(Object.assign({}, sample, { about: "", link: "" }));
  if (text.includes("О проекте:")) throw new Error("пустой блок «О проекте»");
  if (text.includes("Ссылка:")) throw new Error("пустой блок «Ссылка»");
});
check("пустое имя заменяется на тире", () => {
  const text = Order.buildText(Object.assign({}, sample, { name: "" }));
  if (!text.includes("Имя: —")) throw new Error("имя не заменено заглушкой");
});

console.log("\nЭкранирование HTML");

check("теги из поля не попадают в сообщение", () => {
  const html = Order.buildTelegramHtml(
    Object.assign({}, sample, { name: "<b>Иван</b>" })
  );
  if (html.includes("<b>Иван</b>")) throw new Error("сырые теги не экранированы");
  if (!html.includes("&lt;b&gt;Иван&lt;/b&gt;")) throw new Error("нет экранированной версии");
});
check("амперсанд в ссылке экранируется", () => {
  const html = Order.buildTelegramHtml(
    Object.assign({}, sample, { link: "https://e.com/?a=1&b=2" })
  );
  if (!html.includes("&amp;b=2")) throw new Error("& не экранирован");
});

console.log("\nЗапасные способы отправки");

check("ссылка на бота не длиннее 64 символов в параметре start", () => {
  globalThis.SAYTIK.botUsername = "saytik_bot";
  const link = Order.telegramDeepLink(sample);
  const start = decodeURIComponent(link.split("?start=")[1] || "");
  if (!link.startsWith("https://t.me/saytik_bot?start=")) {
    throw new Error("неверная ссылка: " + link);
  }
  if (start.length > 64) throw new Error("start = " + start.length + " символов, максимум 64");
  globalThis.SAYTIK.botUsername = "";
});

check("без юзернейма бота — ссылка «поделиться»", () => {
  const link = Order.telegramDeepLink(sample);
  if (!link.startsWith("https://t.me/share/url")) throw new Error("нет ссылки share/url");
  if (!link.includes("ST-20261008-1234")) throw new Error("текст заявки не в ссылке");
});

check("письмо содержит тему и тело заявки", () => {
  const link = Order.mailtoLink(sample);
  if (!link.startsWith("mailto:hello@saytik.ru")) throw new Error("неверный адрес");
  if (!link.includes("subject=")) throw new Error("нет темы");
  if (decodeURIComponent(link.split("body=")[1]).includes("Иван")) {
    /* имя должно быть в теле письма */
  } else {
    throw new Error("имени нет в теле письма");
  }
});

console.log("\nНастройки");

check("несколько получателей через запятую", () => {
  globalThis.SAYTIK.botChatId = "111, 222 ,333";
  const list = Order.recipients();
  eq(list.length, 3, "ожидалось три chat_id");
  eq(list[1], "222", "пробелы должны обрезаться");
  globalThis.SAYTIK.botChatId = "";
});
check("пустые настройки дают пустой список получателей", () => {
  globalThis.SAYTIK.botChatId = "  ";
  eq(Order.recipients().length, 0);
});

console.log("\nМинимальный заказ и срок из прайса");

check("в тексте README совпадают 15 000 ₽ и 5 дней", () => {
  const fs = require("fs");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const order = fs.readFileSync(path.join(__dirname, "..", "order.html"), "utf8");
  for (const [name, text] of [["index.html", html], ["order.html", order]]) {
    if (!text.includes("15 000")) throw new Error(name + ": нет минимальной цены");
  }
  if (!html.includes("от 5 дней")) throw new Error("index.html: нет минимального срока");
  if (!order.includes("5 дней")) throw new Error("order.html: нет минимального срока");
});

console.log("\nТокен бота не зашит в публичные файлы");

check("botToken и botChatId в order.js отсутствуют", () => {
  const fs = require("fs");
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", "js", "order.js"), "utf8");
  if (/botToken\s*[:=]\s*["'][^"']+/.test(source)) throw new Error("в order.js есть непустой токен");
  if (/botChatId\s*[:=]\s*["'][^"']+/.test(source)) throw new Error("в order.js есть непустой chat_id");
});

check("токен по умолчанию пустой", () => {
  if (globalThis.SAYTIK.botToken) throw new Error("botToken в site.config.js не пустой");
});

console.log(
  "\n" + (failed.length
    ? "Провалено: " + failed.length + ", успешно: " + passed + "\n"
    : "Все проверки пройдены: " + passed + "\n")
);

if (failed.length) {
  failed.forEach((name) => console.log("  · " + name));
  process.exit(1);
}