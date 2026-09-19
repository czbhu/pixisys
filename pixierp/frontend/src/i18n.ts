import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

export const SUPPORTED_LANGS: Record<string, string> = {
  hu: 'Magyar',
  en: 'English',
  de: 'Deutsch',
  ro: 'Română',
  sk: 'Slovenčina',
  cs: 'Čeština',
  hr: 'Hrvatski',
  pl: 'Polski',
  uk: 'Українська',
  sr: 'Srpski',
  sl: 'Slovenščina',
};

export const FLAG_EMOJIS: Record<string, string> = {
  hu: '🇭🇺', en: '🇬🇧', de: '🇩🇪', ro: '🇷🇴', sk: '🇸🇰',
  cs: '🇨🇿', hr: '🇭🇷', pl: '🇵🇱', uk: '🇺🇦', sr: '🇷🇸', sl: '🇸🇮',
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'hu',
    supportedLngs: Object.keys(SUPPORTED_LANGS),
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'pixierp_lang',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
    resources: { hu: { translation: {} } },
    react: { useSuspense: false },
  });

export default i18n;
