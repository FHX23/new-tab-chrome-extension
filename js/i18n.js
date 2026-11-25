'use strict';
// Textos de la interfaz cargados de forma nativa por Chrome desde _locales/<idioma>/messages.json.
// Chrome carga únicamente 1 idioma en memoria (es para español; en para inglés y cualquier otro idioma
// gracias a "default_locale": "en" en manifest.json), de forma 100 % síncrona y sin parsear JS extra.
// En el HTML: data-i18n (texto), data-i18n-ph (placeholder) y data-i18n-title (tooltip y aria-label).

const LANG = String(chrome.i18n?.getUILanguage?.() || navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';

function t(key, ...args) {
  const k = key.includes('-') ? key.replace(/-/g, '_') : key;
  const msg = args.length
    ? chrome.i18n?.getMessage?.(k, args.map(String))
    : chrome.i18n?.getMessage?.(k);
  return msg || key;
}

function applyI18n(root = document) {
  for (const n of root.querySelectorAll('[data-i18n]')) n.textContent = t(n.dataset.i18n);
  for (const n of root.querySelectorAll('[data-i18n-ph]')) n.placeholder = t(n.dataset.i18nPh);
  for (const n of root.querySelectorAll('[data-i18n-title]')) {
    n.title = t(n.dataset.i18nTitle);
    if (!n.dataset.i18n) n.setAttribute('aria-label', n.title); // si tiene texto visible, ese ya es su nombre
  }
  document.documentElement.lang = LANG;
  document.title = t('tabTitle');
}
