import { ref, watch } from 'vue';
import { LANGUAGES, isLanguage } from '../shared/languages.js';
import { messages } from './messages.js';

export function readPreference(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
export function savePreference(key, value) {
  // 隐私浏览或存储被禁用时仍可切换，本次页面不依赖写入成功。
  try { localStorage.setItem(key, value); } catch { /* 忽略存储权限错误。 */ }
}
function initialLanguage() {
  const saved = readPreference('sunny.uiLanguage', '');
  if (isLanguage(saved)) return saved;
  for (const value of navigator.languages || [navigator.language]) {
    const code = value.toLowerCase();
    if (code.startsWith('zh')) return /tw|hk|mo|hant/.test(code) ? 'zh-TW' : 'zh-CN';
    if (code.startsWith('fr')) return 'fr-CA';
    if (code.startsWith('es')) return 'es';
    if (code.startsWith('en')) return 'en';
  }
  return 'en';
}
export function useI18n() {
  const locale = ref(initialLanguage());
  watch(locale, value => {
    document.documentElement.lang = value;
    savePreference('sunny.uiLanguage', value);
  }, { immediate: true });
  const t = key => messages[key]?.[LANGUAGES.findIndex(language => language.code === locale.value)] || messages[key]?.[2] || key;
  return { locale, t };
}
