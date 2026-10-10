"use strict";
/* ============================================================================
   site.config.js — единственный файл, который нужно править под себя.

   Здесь только публичные данные: контакты, ссылки и параметры отправки
   заявки. Токен бота тоже лежит здесь — читайте предупреждение ниже.

   В браузере файл кладёт настройки в globalThis.SAYTIK, в Node — отдаёт
   через module.exports (так его читают тесты).
   ========================================================================= */

var SAYTIK = {
  /* --- Кто мы ---------------------------------------------------------- */
  brand: "Сайтик",
  brandTagline: "разработка сайтов под ключ",

  /* --- Контакты --------------------------------------------------------
     Замените на свои. Пустые строки просто скрывают блок в подвале.      */
  phone: "+7 (905) 495-96-12",
  phoneHref: "+79054959612",
  email: "andreydragon22813@gmail.com",

  /* Telegram для заявок — можно юзернейм или ссылку-приглашение */
  telegram: "@ckot_23",
  telegramHref: "https://t.me/ckot_23",

  /* --- Условия работы -------------------------------------------------- */
  replyTime: "отвечаем в течение рабочего дня",
  prepayment: "50% предоплата",
  iterations: "2 итерации правок включены",
  warranty: "14 дней гарантии на баги",
  minDays: 5,

  /* --- Telegram --------------------------------------------------------
     Заявки в бота больше не уходят: sendToTelegram = false.
     Кнопки «написать в Telegram / письмом» остаются только как запас,
     если таблица не ответила. */
  sendToTelegram: false,
  botToken: "8589128917:AAGzIvm27OPXM0Tqo4CXx2HtZOtXvYIvs3o",
  botChatId: "7114829971",
  botUsername: "",

  /* --- Куда писать заявки: эта Google Таблица --------------------------
     https://docs.google.com/spreadsheets/d/1gVCfz4RpoJ-sUxKdmLAJf9tE-mhsCpgLsrBvMGkR2Hw/edit
     Ссылка /edit сайту не подходит — нужен URL веб-приложения из sheets.gs.
     Как получить sheetsWebhook: README, раздел «Google Таблица». */
  spreadsheetId: "1gVCfz4RpoJ-sUxKdmLAJf9tE-mhsCpgLsrBvMGkR2Hw",
  sheetsWebhook: "https://script.google.com/macros/s/AKfycbyZ-_q_ZO4dpj8SV_mIh7phn_N7bdz-IgclMPsatar8FhpAGt-yer9zoZwaZhp7uDuB0A/exec",

  /* Пауза перед повторной отправкой формы, мс — защита от спама */
  resendDelay: 2000
};

if (typeof module !== "undefined" && module.exports) module.exports = SAYTIK;
if (typeof globalThis !== "undefined") globalThis.SAYTIK = SAYTIK;