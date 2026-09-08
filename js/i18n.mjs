// js/i18n.mjs - résolution de langue + fabrique de traducteur. Pur, sans DOM.

export function resolveLang(stored, navigatorLanguages = [], supported = ['en', 'fr']) {
  if (supported.includes(stored)) return stored;
  for (const l of navigatorLanguages) {
    const base = String(l).toLowerCase().split('-')[0];
    if (supported.includes(base)) return base;
  }
  return supported[0];
}

export function makeTranslator(dicts, lang, fallbackLang = 'en') {
  const primary = dicts[lang] ?? {};
  const fallback = dicts[fallbackLang] ?? {};
  return function t(key, params) {
    let s = primary[key] ?? fallback[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replaceAll(`{${k}}`, String(v));
      }
    }
    return s;
  };
}
