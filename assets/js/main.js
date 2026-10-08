"use strict";
/* ============================================================================
   main.js — поведение страниц сайта «Сайтик».

   Здесь нет ничего, что должно ломаться: если скрипт не загрузился,
   страница остаётся читаемой — ссылки работают, текст на месте,
   а формы ниже просто не отправятся.
   ========================================================================= */

var SAYTIK_CFG = (typeof globalThis !== "undefined" && globalThis.SAYTIK) || {};

/* ---------------------------------------------------------------------------
   1. Подстановка контактов из site.config.js

   Узел с data-contact бывает трёх видов: сам ссылкой, обычным текстом
   или контейнером со ссылкой внутри. Во всех трёх случаях результат должен
   быть один — одна ссылка с адресом и подписью из настроек.
   ------------------------------------------------------------------------ */
function setLinkAttrs(link, kind, href) {
  if (kind === "telegram" && /^https?:/.test(href || "")) {
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
  } else {
    link.removeAttribute("target");
    link.removeAttribute("rel");
  }
}

function fillContacts() {
  var cfg = SAYTIK_CFG || {};
  var text = { phone: cfg.phone, email: cfg.email, telegram: cfg.telegram };

  /* Схему ставим здесь, а не в настройках: без неё браузер считает
     «+79054959612» относительным адресом и превращает в .../+79054959612. */
  var href = {
    phone: cfg.phoneHref ? "tel:" + String(cfg.phoneHref).replace(/[^\d+]/g, "") : "",
    email: cfg.email ? "mailto:" + cfg.email : "",
    telegram: cfg.telegramHref || ""
  };

  document.querySelectorAll("[data-contact]").forEach(function (node) {
    var kind = node.getAttribute("data-contact");
    var value = text[kind];
    if (!value) { node.remove(); return; }

    var link;
    if (node.tagName === "A") {
      link = node;
    } else {
      /* пересобираем содержимое: в разметке могли остаться старый текст
         или ссылка без адреса — оставляем один актуальный вариант */
      link = document.createElement("a");
      node.textContent = "";
      node.appendChild(link);
    }

    link.textContent = value;
    if (href[kind]) link.setAttribute("href", href[kind]);
    setLinkAttrs(link, kind, href[kind]);
  });

  if (cfg.replyTime) {
    var hint = document.getElementById("ctaContacts");
    if (hint) hint.textContent = cfg.replyTime;
  }
}

/* ---------------------------------------------------------------------------
   2. Год в подвале
   ------------------------------------------------------------------------ */
function fillYear() {
  var node = document.getElementById("year");
  if (node) node.textContent = String(new Date().getFullYear());
}

/* ---------------------------------------------------------------------------
   3. Шапка: тень при прокрутке + мобильное меню
   ------------------------------------------------------------------------ */
function initHeader() {
  var header = document.getElementById("header");
  var burger = document.getElementById("burger");
  var nav = document.getElementById("nav");

  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  if (!burger || !nav) return;

  var close = function () {
    nav.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    burger.setAttribute("aria-label", "Открыть меню");
  };

  burger.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Закрыть меню" : "Открыть меню");
  });

  nav.addEventListener("click", function (event) {
    if (event.target.closest("a")) close();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") close();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 900) close();
  });
}

/* ---------------------------------------------------------------------------
   4. Появление блоков при прокрутке
   ------------------------------------------------------------------------ */
function initReveal() {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !("IntersectionObserver" in window)) return;

  var targets = document.querySelectorAll(
    ".card, .plan, .step, .term, .checklist li, .faq__item, .table-wrap, .cta__inner, .calc"
  );
  if (!targets.length) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry, index) {
      if (!entry.isIntersecting) return;
      var node = entry.target;
      node.style.transitionDelay = Math.min(index * 60, 240) + "ms";
      node.classList.add("is-in");
      io.unobserve(node);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  targets.forEach(function (node) {
    node.classList.add("reveal");
    io.observe(node);
  });
}

/* ---------------------------------------------------------------------------
   Запуск
   ------------------------------------------------------------------------ */
function init() {
  fillContacts();
  fillYear();
  initHeader();
  initReveal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { fillContacts: fillContacts, fillYear: fillYear };
}