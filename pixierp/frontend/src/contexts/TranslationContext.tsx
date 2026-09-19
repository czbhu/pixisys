import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { SUPPORTED_LANGS } from '../i18n';

interface TranslationContextValue {
  lang: string;
  setLang: (lang: string) => void;
  t: (text: string) => string;
  isTranslating: boolean;
  supportedLangs: Record<string, string>;
  clearCache: () => void;
}

const TranslationContext = createContext<TranslationContextValue>({
  lang: 'hu',
  setLang: () => {},
  t: (text) => text,
  isTranslating: false,
  supportedLangs: SUPPORTED_LANGS,
  clearCache: () => {},
});

export const useTranslation = () => useContext(TranslationContext);

// ── Module-level singletons (survive re-renders) ──────────────────────────────
const translationCache: Record<string, Record<string, string>> = {};
// Strings already sent to backend (per lang) — avoid duplicate API calls
const sentToBackend: Record<string, Set<string>> = {};
let currentLang = localStorage.getItem('pixierp_lang') || 'hu';
let scanDebounce: ReturnType<typeof setTimeout> | null = null;
let applyCallback: (() => void) | null = null;

// Strings to skip: too short, numeric, punctuation-only, etc.
const SKIP_RE = /^[\d\s.,;:!?'"()[\]{}\-+=%&@#*/\\|<>^~`_$€£¥°±×÷→←↑↓…""''•–—]+$/;

function isSkippable(text: string): boolean {
  if (!text || text.length < 2) return true;
  if (SKIP_RE.test(text)) return true;
  // Skip "222 text", "72 szöveg", "0 db" — number followed by word(s)
  if (/^\d[\d\s.,/]*\s+\S/.test(text)) return true;
  // Skip "x / y" pagination patterns
  if (/^\d+\s*[/–-]\s*\d+/.test(text)) return true;
  // Skip short all-uppercase abbreviations like "PDF", "HUF", "SK", "UA"
  if (/^[A-Z0-9_\-\/]+$/.test(text) && text.length <= 6) return true;
  return false;
}

// ── Core translation logic ────────────────────────────────────────────────────

async function fetchAndCacheTranslations(texts: string[], lang: string, onDone?: () => void) {
  if (!texts.length || lang === 'hu') return;
  try {
    const res = await api.post('/i18n/translate/', { texts, target: lang });
    translationCache[lang] = { ...(translationCache[lang] || {}), ...res.data };
    onDone?.();
  } catch {
    // ignore
  }
}

function collectAndApplyDOM(targetLang: string, onNewStrings?: (count: number) => void) {
  if (targetLang === 'hu') return;
  const root = document.getElementById('root');
  if (!root) return;
  const cache = translationCache[targetLang] || {};
  if (!sentToBackend[targetLang]) sentToBackend[targetLang] = new Set();
  const sent = sentToBackend[targetLang];

  const newStrings: string[] = [];
  const toApply: Array<{ node: Text; original: string; translated: string }> = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const el = node.parentElement;
      if (!el) return NodeFilter.FILTER_REJECT;
      const tag = el.tagName?.toLowerCase() || '';
      if (['script', 'style', 'code', 'pre'].includes(tag)) return NodeFilter.FILTER_REJECT;
      if (el.closest('[data-notranslate]') || el.closest('.notranslate') || el.closest('.ant-select-dropdown')) return NodeFilter.FILTER_REJECT;
      if (el.isContentEditable || tag === 'input' || tag === 'textarea') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const raw = node.textContent || '';
    const text = raw.trim();
    if (isSkippable(text)) continue;
    // Check if already translated (parent has data-t attr with same lang)
    const parent = node.parentElement;
    if (parent?.dataset?.tLang === targetLang && parent?.dataset?.tSrc === text) continue;
    if (cache[text]) {
      toApply.push({ node, original: text, translated: cache[text] });
    } else if (!sent.has(text)) {
      newStrings.push(text);
      sent.add(text);
    }
  }

  // Apply cached translations
  for (const { node, original, translated } of toApply) {
    if (translated && translated !== original) {
      const raw = node.textContent || '';
      // Replace the trimmed part while preserving surrounding whitespace
      const leading = raw.match(/^\s*/)?.[0] || '';
      const trailing = raw.match(/\s*$/)?.[0] || '';
      node.textContent = leading + translated + trailing;
      if (node.parentElement) {
        node.parentElement.dataset.tLang = targetLang;
        node.parentElement.dataset.tSrc = original;
      }
    }
  }

  if (newStrings.length > 0) {
    onNewStrings?.(newStrings.length);
    // Batch into chunks of 80
    const CHUNK = 80;
    for (let i = 0; i < newStrings.length; i += CHUNK) {
      const chunk = newStrings.slice(i, i + CHUNK);
      fetchAndCacheTranslations(chunk, targetLang, () => {
        collectAndApplyDOM(targetLang);
        applyCallback?.();
      });
    }
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<string>(currentLang);
  const [isTranslating, setIsTranslating] = useState(false);
  const [, forceUpdate] = useState(0);
  const domObserverRef = useRef<MutationObserver | null>(null);
  const scanCountRef = useRef(0);

  applyCallback = useCallback(() => forceUpdate(n => n + 1), []);

  const loadAllTranslations = useCallback(async (targetLang: string) => {
    if (targetLang === 'hu') return;
    setIsTranslating(true);
    try {
      const res = await api.get('/i18n/translations/', { params: { lang: targetLang } });
      translationCache[targetLang] = { ...(translationCache[targetLang] || {}), ...res.data };
    } catch {
      // ignore
    } finally {
      setIsTranslating(false);
    }
  }, []);

  const setLang = useCallback((newLang: string) => {
    currentLang = newLang;
    setLangState(newLang);
    localStorage.setItem('pixierp_lang', newLang);
    // Reset sent-tracking so DOM re-scan picks up everything
    delete sentToBackend[newLang];
    if (newLang !== 'hu') {
      loadAllTranslations(newLang).then(() => {
        forceUpdate(n => n + 1);
        setTimeout(() => collectAndApplyDOM(newLang, () => forceUpdate(n => n + 1)), 100);
      });
    } else {
      // Restore original text
      document.querySelectorAll('[data-t-lang]').forEach(el => {
        (el as HTMLElement).removeAttribute('data-t-lang');
        (el as HTMLElement).removeAttribute('data-t-src');
      });
    }
  }, [loadAllTranslations]);

  const t = useCallback((text: string): string => {
    if (!text || currentLang === 'hu') return text;
    const cache = translationCache[currentLang];
    if (cache?.[text]) return cache[text];
    // Queue via DOM scanner (not duplicated because of sentToBackend check)
    if (!sentToBackend[currentLang]) sentToBackend[currentLang] = new Set();
    if (!sentToBackend[currentLang].has(text)) {
      sentToBackend[currentLang].add(text);
      if (scanDebounce) clearTimeout(scanDebounce);
      scanDebounce = setTimeout(() => {
        fetchAndCacheTranslations([text], currentLang, () => {
          collectAndApplyDOM(currentLang);
          applyCallback?.();
        });
      }, 200);
    }
    return text;
  }, []);

  const clearCache = useCallback(() => {
    Object.keys(translationCache).forEach(k => delete translationCache[k]);
    Object.keys(sentToBackend).forEach(k => delete sentToBackend[k]);
    forceUpdate(n => n + 1);
  }, []);

  // MutationObserver: re-scan DOM after any React render
  useEffect(() => {
    if (lang === 'hu') {
      domObserverRef.current?.disconnect();
      return;
    }
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      // Microtask after DOM commit
      Promise.resolve().then(() => {
        pending = false;
        collectAndApplyDOM(currentLang, (n) => {
          if (n > 0) forceUpdate(c => c + 1);
        });
      });
    });
    observer.observe(document.getElementById('root') || document.body, {
      childList: true, subtree: true,
    });
    domObserverRef.current = observer;
    // Initial scan
    collectAndApplyDOM(lang, (n) => { if (n > 0) forceUpdate(c => c + 1); });
    return () => observer.disconnect();
  }, [lang]);

  // On mount: load cached translations and scan DOM
  useEffect(() => {
    if (lang !== 'hu') {
      loadAllTranslations(lang).then(() => {
        forceUpdate(n => n + 1);
        collectAndApplyDOM(lang, (n) => { if (n > 0) forceUpdate(c => c + 1); });
      });
    }
  }, []); // eslint-disable-line

  return (
    <TranslationContext.Provider value={{ lang, setLang, t, isTranslating, supportedLangs: SUPPORTED_LANGS, clearCache }}>
      {children}
    </TranslationContext.Provider>
  );
};

export default TranslationContext;
