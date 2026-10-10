"use strict";
/* ============================================================================
   order.js — приём заявки со страницы order.html.

   Как работает отправка:

     заполнили форму → проверка полей → Google Таблица (sheetsWebhook)
                                             ↓ таблица не ответила
                       запасные кнопки: написать в Telegram / отправить письмом

   Telegram-бот по умолчанию выключен (SAYTIK.sendToTelegram = false).
   Сервер не нужен: браузер сам стучится в веб-приложение Apps Script.
   ========================================================================= */

var CFG = (typeof globalThis !== "undefined" && globalThis.SAYTIK) || {};
var TG_API = "https://api.telegram.org/bot";
var LAST_KEY = "saytik.order.draft";

/* ---------------------------------------------------------------------------
   1. Определение типа контакта: телефон / почта / Telegram
   ------------------------------------------------------------------------ */
var CONTACT_KINDS = [
  {
    kind: "telegram",
    label: "Telegram",
    /* 4–32 символа латиницей и подчёркиванием, и обязательно хотя бы одна буква —
       иначе строка из одних цифр приняла бы номер телефона за юзернейм. */
    re: /^(?=[a-z0-9_]{4,32}$)(?=[^0-9]*[a-z_])[a-z0-9_]+$/i
  },
  {
    kind: "email",
    label: "почта",
    re: /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/i
  },
  {
    kind: "phone",
    label: "телефон",
    /* допускаем +, пробелы, скобки, дефисы; цифр должно быть 10–15 */
    re: /^\+?[\d\s\-()]{10,20}$/
  }
];

function kindLabel(kind) {
  for (var i = 0; i < CONTACT_KINDS.length; i++) {
    if (CONTACT_KINDS[i].kind === kind) return CONTACT_KINDS[i].label;
  }
  return "не распознан";
}

function detectContact(raw) {
  var value = String(raw || "").trim();
  if (!value) return null;

  var make = function (kind, digits) {
    return { kind: kind, label: kindLabel(kind), value: value, digits: digits };
  };

  /* @username — проверяем только то, что после @ */
  if (value.charAt(0) === "@") {
    return CONTACT_KINDS[0].re.test(value.slice(1)) ? make("telegram", 0) : null;
  }

  for (var i = 0; i < CONTACT_KINDS.length; i++) {
    if (!CONTACT_KINDS[i].re.test(value)) continue;
    var digits = (value.match(/\d/g) || []).length;
    if (CONTACT_KINDS[i].kind === "phone" && (digits < 10 || digits > 15)) return null;
    return make(CONTACT_KINDS[i].kind, digits);
  }
  return null;
}

/* ---------------------------------------------------------------------------
   2. Сбор заявки
   ------------------------------------------------------------------------ */
function pad(number) { return String(number).padStart(2, "0"); }

function orderNumber() {
  var now = new Date();
  var random = Math.floor(Math.random() * 9000) + 1000;
  return "ST-" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
         "-" + random;
}

function collect() {
  var get = function (id) {
    var node = document.getElementById(id);
    return node ? String(node.value || "").trim() : "";
  };

  var contact = get("contact");
  var detected = detectContact(contact);
  var number = orderNumber();
  var created = new Date();

  return {
    number: number,
    name: get("name"),
    contact: contact,
    kind: detected ? detected.kind : "",
    kindLabel: detected ? detected.label : "не распознан",
    type: get("type"),
    budget: get("budget"),
    deadline: get("deadline"),
    about: get("about"),
    link: get("link"),
    agree: Boolean(document.getElementById("agree") && document.getElementById("agree").checked),
    createdText: pad(created.getDate()) + "." + pad(created.getMonth() + 1) + "." + created.getFullYear() +
                 " " + pad(created.getHours()) + ":" + pad(created.getMinutes())
  };
}

/* Текст заявки — он же уходит в мессенджер, и в письмо, и в резервную кнопку,
   поэтому собирается один раз и используется всеми тремя способами. */
function buildText(order) {
  var lines = [
    "Новая заявка с сайта",
    "",
    "Номер: " + order.number,
    "Имя: " + (order.name || "—"),
    "Контакт (" + order.kindLabel + "): " + order.contact,
    "Что нужно: " + (order.type || "—"),
    "Бюджет: " + (order.budget || "—"),
    "Срок: " + (order.deadline || "—")
  ];

  if (order.about) lines.push("", "О проекте:", order.about);
  if (order.link) lines.push("", "Ссылка: " + order.link);

  lines.push("", "Получено: " + order.createdText);
  return lines.join("\n");
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTelegramHtml(order) {
  var lines = [
    "<b>Новая заявка с сайта</b>",
    "",
    "Номер: <code>" + escapeHtml(order.number) + "</code>",
    "Имя: " + escapeHtml(order.name || "—"),
    "Контакт (" + escapeHtml(order.kindLabel) + "): " + escapeHtml(order.contact),
    "Что нужно: " + escapeHtml(order.type || "—"),
    "Бюджет: " + escapeHtml(order.budget || "—"),
    "Срок: " + escapeHtml(order.deadline || "—")
  ];
  if (order.about) lines.push("", "<b>О проекте:</b>", escapeHtml(order.about));
  if (order.link) lines.push("", "Ссылка: " + escapeHtml(order.link));
  lines.push("", "Получено: " + escapeHtml(order.createdText));
  return lines.join("\n");
}

/* ---------------------------------------------------------------------------
   3. Отправка в Telegram
   ------------------------------------------------------------------------ */
function recipients() {
  return String(CFG.botChatId || "").split(",")
    .map(function (item) { return item.trim(); })
    .filter(Boolean);
}

function sendTelegram(order) {
  var token = String(CFG.botToken || "").trim();
  var targets = recipients();
  if (!token || !targets.length) {
    return Promise.reject(new Error("не задан botToken или botChatId"));
  }

  var url = TG_API + token + "/sendMessage";
  var jobs = targets.map(function (chatId) {
    return fetch(url + "?chat_id=" + encodeURIComponent(chatId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildTelegramHtml(order),
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    }).then(function (response) {
      if (!response.ok) throw new Error("Telegram ответил " + response.status);
      return response.json();
    });
  });

  return Promise.all(jobs);
}

/* ---------------------------------------------------------------------------
   3b. Архив в Google Таблице через Apps Script (sheets.gs)
   ------------------------------------------------------------------------ */
function buildSheetsPayload(order) {
  return {
    number: order.number,
    created: order.createdText,
    name: order.name || "",
    contact: order.contact || "",
    kind: order.kindLabel || "",
    type: order.type || "",
    budget: order.budget || "",
    deadline: order.deadline || "",
    about: order.about || "",
    link: order.link || "",
    page: typeof location !== "undefined" && location.href ? location.href : ""
  };
}

function sendSheets(order) {
  var url = String(CFG.sheetsWebhook || "").trim();
  if (!url) return Promise.reject(new Error("не задан sheetsWebhook"));

  /* text/plain — без preflight. JSON в application/json браузер сначала
     спрашивает CORS, а ответ Apps Script на OPTIONS пустой. */
  return fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(buildSheetsPayload(order))
  }).then(function (response) {
    if (response.type === "opaque") return { ok: true };
    if (!response.ok) throw new Error("таблица ответила " + response.status);
    return response.text().then(function (text) {
      var parsed = {};
      try { parsed = JSON.parse(text); } catch (error) { parsed = {}; }
      if (parsed.ok === false) {
        throw new Error(parsed.error || "таблица отклонила заявку");
      }
      return parsed;
    });
  });
}

function deliveryChannels() {
  var list = [];
  if (CFG.sendToTelegram !== false &&
      String(CFG.botToken || "").trim() &&
      recipients().length) {
    list.push("telegram");
  }
  if (String(CFG.sheetsWebhook || "").trim()) list.push("sheets");
  return list;
}

/* Успех, если сработал хотя бы один настроенный канал. */
function deliver(order) {
  var channels = deliveryChannels();
  if (!channels.length) {
    return Promise.reject(new Error("не задан sheetsWebhook"));
  }

  var jobs = channels.map(function (name) {
    var job = name === "sheets" ? sendSheets(order) : sendTelegram(order);
    return job.then(
      function () { return { ok: true, name: name }; },
      function (error) { return { ok: false, name: name, error: error }; }
    );
  });

  return Promise.all(jobs).then(function (results) {
    var ok = 0;
    var lastError = null;
    for (var i = 0; i < results.length; i++) {
      if (results[i].ok) ok++;
      else lastError = results[i].error;
    }
    if (!ok) throw lastError || new Error("не отправилось ни в один канал");
    return results;
  });
}

/* ---------------------------------------------------------------------------
   4. Запасные способы — когда автоматическая отправка не вышла
   ------------------------------------------------------------------------ */
function base64url(text) {
  var bytes = new TextEncoder().encode(text);
  var binary = "";
  for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function telegramDeepLink(order) {
  var username = String(CFG.botUsername || "").replace(/^@/, "").trim();
  if (username) {
    /* В параметре ?start= Telegram разрешает 64 символа base64url,
       поэтому кладём туда только номер — бот попросит детали в чате. */
    var compact = base64url(JSON.stringify({ v: 1, n: order.number, c: order.contact }));
    return "https://t.me/" + username + "?start=" + compact.slice(0, 64);
  }
  /* location есть только в браузере — в Node подставим пустую строку,
     чтобы тесты на ссылку можно было запускать без окна браузера */
  var page = typeof location !== "undefined" && location.href ? location.href : "";
  return "https://t.me/share/url?url=" +
    encodeURIComponent(page) +
    "&text=" + encodeURIComponent(buildText(order));
}

function mailtoLink(order) {
  return "mailto:" + (CFG.email || "") +
    "?subject=" + encodeURIComponent("Заявка " + order.number + " с сайта Сайтик") +
    "&body=" + encodeURIComponent(buildText(order));
}

function showFallback(order, reason) {
  var box = document.getElementById("fallback");
  if (!box) return;

  document.getElementById("tgFallback").setAttribute("href", telegramDeepLink(order));
  document.getElementById("mailFallback").setAttribute("href", mailtoLink(order));

  var note = document.getElementById("fallbackText");
  if (note) {
    note.textContent = reason
      ? "Причина: " + reason + ". Текст заявки уже подставлен — останется нажать кнопку."
      : "Текст заявки уже подставлен — останется нажать кнопку.";
  }
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------------------------------------------------------------------------
   5. Черновик — чтобы не потерять заполненное при уходе со страницы
   ------------------------------------------------------------------------ */
var DRAFT_FIELDS = ["name", "contact", "type", "budget", "deadline", "about", "link"];

function saveDraft(order) {
  try {
    var draft = {};
    DRAFT_FIELDS.forEach(function (field) {
      var node = document.getElementById(field);
      if (node) draft[field] = node.value;
    });
    localStorage.setItem(LAST_KEY, JSON.stringify(draft));
  } catch (error) { /* приватный режим — молча пропускаем */ }
}

/* Ссылки с главной вида order.html?type=corp приходят с уже выбранным пакетом. */
var PRESET_INDEX = { start: 1, landing: 0, visitka: 2, corp: 3, shop: 4, fix: 5 };

/* Что было в форме до наших правок. У <select> значение непустое всегда, а
   defaultValue браузеры отдают по-разному, поэтому сравниваем со снимком. */
function snapshotDefaults() {
  var snap = {};
  DRAFT_FIELDS.forEach(function (field) {
    var node = document.getElementById(field);
    if (node) snap[field] = node.value;
  });
  return snap;
}

function applyPreset(defaults) {
  var preset = new URLSearchParams(location.search).get("type");
  var select = document.getElementById("type");
  if (!preset || !select) return;
  var wanted = PRESET_INDEX[preset.toLowerCase()];
  if (wanted !== undefined && wanted < select.options.length &&
      select.value === defaults.type) {
    select.selectedIndex = wanted;
  }
}

function restoreDraft(defaults) {
  try {
    var raw = localStorage.getItem(LAST_KEY);
    if (!raw) return;
    var draft = JSON.parse(raw);
    DRAFT_FIELDS.forEach(function (field) {
      var node = document.getElementById(field);
      if (!node || !draft[field]) return;
      /* восстанавливаем только то, что ещё не трогали — иначе перетрём
         то, что пришло из ссылки ?type=... */
      if (node.value === defaults[field]) node.value = draft[field];
    });
    localStorage.removeItem(LAST_KEY);
  } catch (error) { /* черновик не читается — начинаем с чистого листа */ }
}

/* ---------------------------------------------------------------------------
   6. Подсветка типа контакта
   ------------------------------------------------------------------------ */
function paintContactKind(raw) {
  var detected = detectContact(raw);
  document.querySelectorAll("#contactKind .chip").forEach(function (chip) {
    chip.classList.toggle("is-on", Boolean(detected) && chip.dataset.kind === detected.kind);
  });
}

/* ---------------------------------------------------------------------------
   7. Статусы и кнопка
   ------------------------------------------------------------------------ */
function setStatus(message, kind) {
  var node = document.getElementById("formStatus");
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || "";
  node.className = "form__status" + (kind ? " form__status--" + kind : "");
}

function toggleBusy(busy) {
  var button = document.getElementById("submitBtn");
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.textContent = busy ? "Отправляю…" : "Отправить заявку";
}

function showError(id, visible) {
  var node = document.getElementById(id);
  if (node) node.hidden = !visible;
}

var lastSentAt = 0;

/* ---------------------------------------------------------------------------
   8. Отправка формы
   ------------------------------------------------------------------------ */
function handleSubmit(event) {
  event.preventDefault();

  var form = event.target;
  var order = collect();

  /* --- проверки --- */
  var problems = [];
  if (!order.name) problems.push(["name", "Укажите имя"]);
  if (!order.contact || !order.kind) problems.push(["contact", null]);
  if (!order.agree) showError("agreeError", true); else showError("agreeError", false);
  if (!order.agree) problems.push(["agree", "Без согласия не отправить"]);

  showError("contactError", !order.kind);
  document.getElementById("contact").setAttribute("aria-invalid", String(!order.kind));

  if (problems.length) {
    var first = document.getElementById(problems[0][0]);
    if (first && first.focus) first.focus();
    setStatus("Проверьте отмеченные поля.", "error");
    return;
  }

  var delay = Number(CFG.resendDelay) || 0;
  var since = Date.now() - lastSentAt;
  if (since < delay) {
    setStatus("Подождите пару секунд перед повторной отправкой.", "error");
    return;
  }
  lastSentAt = Date.now();

  saveDraft(order);
  toggleBusy(true);
  setStatus("Отправляю заявку…");

  deliver(order)
    .then(function () {
      toggleBusy(false);
      form.reset();
      paintContactKind("");
      setStatus(
        "Готово, заявка " + order.number + " отправлена. Отвечу в течение рабочего дня.",
        "ok"
      );
      var fallback = document.getElementById("fallback");
      if (fallback) fallback.hidden = true;
    })
    .catch(function (error) {
      toggleBusy(false);
      setStatus("Автоотправка не сработала — ниже есть запасные кнопки.", "error");
      showFallback(order, error && error.message ? error.message : "сетевая ошибка");
    });
}

/* ---------------------------------------------------------------------------
   9. Запуск
   ------------------------------------------------------------------------ */
function initOrder() {
  var form = document.getElementById("orderForm");
  if (!form) return;

  /* черновик важнее ссылки: человек уже начал заполнять форму */
  var defaults = snapshotDefaults();
  restoreDraft(defaults);
  applyPreset(defaults);

  var contact = document.getElementById("contact");
  if (contact) {
    /* черновик мог вернуть контакт — сразу показываем его тип */
    paintContactKind(contact.value);
    contact.addEventListener("input", function () {
      paintContactKind(contact.value);
      if (contact.value.trim()) showError("contactError", false);
    });
  }

  var agree = document.getElementById("agree");
  if (agree) agree.addEventListener("change", function () {
    if (agree.checked) showError("agreeError", false);
  });

  form.addEventListener("submit", handleSubmit);
}

/* В Node документов нет: файл нужен там только ради чистых функций,
   которые проверяет tests/order.js. */
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initOrder);
  } else {
    initOrder();
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    detectContact: detectContact,
    collect: collect,
    buildText: buildText,
    buildTelegramHtml: buildTelegramHtml,
    buildSheetsPayload: buildSheetsPayload,
    telegramDeepLink: telegramDeepLink,
    mailtoLink: mailtoLink,
    recipients: recipients,
    deliveryChannels: deliveryChannels
  };
}