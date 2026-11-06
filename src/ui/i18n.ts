import { Lang, UI } from '../content';

let current: Lang = 'en';
const listeners: ((l: Lang) => void)[] = [];

export function getLang(): Lang { return current; }

export function initLang() {
  try {
    const saved = localStorage.getItem('jw-lang') as Lang | null;
    if (saved === 'en' || saved === 'es') current = saved;
  } catch { /* storage may be unavailable */ }
  document.documentElement.lang = current;
}

export function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('jw-lang', l); } catch { /* ignore */ }
  applyStatic();
  for (const fn of listeners) fn(l);
}

export function onLang(fn: (l: Lang) => void) { listeners.push(fn); }

export function t(key: string): string {
  const e = UI[key];
  return e ? e[current] : key;
}

/** Fill every element with data-i18n="key". */
export function applyStatic(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n!); });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle!); });
}
