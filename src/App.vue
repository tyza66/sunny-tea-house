<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { LANGUAGES, isLanguage, resolveLanguage, ERROR_KEYS } from '../shared/languages.js';
import { useI18n, readPreference, savePreference } from './i18n.js';
import { getShopConfig, requestReview, isStaticHost } from './api.js';
import { clearBrowserKey, configureBrowserAI, hasBrowserKey, normalizeKey,
  sessionUsage, BROWSER_ERROR_KEYS } from './browser-ai.js';
import { readSettings, saveSettings, resetSettings, setStoredKey, clearStoredKey, getStoredKey, defaultGoogleUrl } from './settings.js';

const { locale, t } = useI18n();

const THEME_KEY = 'yichayiyan.theme';
const theme = ref(readPreference(THEME_KEY, '') || 'light');
function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.style.colorScheme = theme.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#191512' : '#f5f0e6');
}
watch(theme, value => { savePreference(THEME_KEY, value); applyTheme(); }, { immediate: true });
function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark'; }
const savedOutput = readPreference('yichayiyan.reviewLanguage', 'auto');
const reviewLanguage = ref(isLanguage(savedOutput) ? savedOutput : 'auto');
watch(reviewLanguage, value => { savePreference('yichayiyan.reviewLanguage', value); confirmed.value = false; notice.value = ''; });

const config = ref(null);
// 静态托管（GitHub Pages 等）没有服务端：右下角的设置面板就是这套页面的「环境变量」，
// 填入密钥后由浏览器直连 AI 服务完成真实生成。
const staticHost = ref(false);
const staticDemo = computed(() => !!config.value?.demo && staticHost.value);
const aiReady = ref(false);
const aiCount = ref(0);
const settingsOpen = ref(false);
// 记录是谁打开的面板，关闭时把焦点还给它，键盘用户不会丢失位置。
const settingsOpener = ref(null);
const settingsPanel = ref(null);
const settingsFirstEl = ref(null);
const settingsKeyEl = ref(null);
const settingsHasKey = ref(false);
const settingsError = ref('');
const settingsForm = ref(blankSettingsForm());
const selectedTags = ref([]);
const selectedPlatform = ref('Google');
const generatedContent = ref('');
const generatedFor = ref(null);
const isLoading = ref(false);
const error = ref('');
const notice = ref('');
const editor = ref(null);
const confirmed = ref(false);
const copying = ref(false);
const languageOpen = ref(false);
const pickerElement = ref(null);
const pickerButton = ref(null);
const languageMenuId = 'ui-language-menu';
const platforms = [
  { name: 'Google', mark: 'G', detail: 'googleStyle', className: 'google' },
  { name: '小红书', mark: '小红书', detail: 'redStyle', className: 'red' },
];
const outputLanguage = computed(() => resolveLanguage(reviewLanguage.value, selectedPlatform.value));
// 方案3：评价语言作为“草稿属性”，用编辑区内的分段控件切换（原下拉框已移除）。
const languageOptions = computed(() => [{ code: 'auto', label: t('auto') }, ...LANGUAGES]);
function setReviewLanguage(code) { if (reviewLanguage.value !== code) reviewLanguage.value = code; }
// 界面语言不参与草稿签名；只改变展示语言不会让已编辑的文案失效。
const signature = computed(() => JSON.stringify({ platform: selectedPlatform.value, language: outputLanguage.value, tags: [...selectedTags.value].sort() }));
const platformName = platform => platform === '小红书' ? t('redName') : platform;
const languageName = code => LANGUAGES.find(item => item.code === code)?.label || '';
const currentLanguageName = computed(() => LANGUAGES.find(item => item.code === locale.value)?.label || '');
const languageButtonLabel = computed(() => `${t('language')}: ${currentLanguageName.value}`);
const stale = computed(() => generatedFor.value && generatedFor.value.signature !== signature.value);
const characterCount = computed(() => [...generatedContent.value].length);
const tooLong = computed(() => generatedFor.value?.platform === '小红书' && characterCount.value > 150);
const canCopy = computed(() => generatedContent.value.trim() && !stale.value && !tooLong.value && !isLoading.value && confirmed.value);
const targetUrl = computed(() => config.value?.urls[generatedFor.value?.platform] || '');
// 生成按钮下方的说明：静态托管且未配密钥时，引导去右下角设置。
const generationNote = computed(() => (config.value?.demo
  ? (aiReady.value ? 'aiActive' : staticHost.value ? 'settingsFabHint' : 'demoNote')
  : 'aiNote'));
watch([locale, config], () => { document.title = `${config.value?.store.name || 'Sunny Tea House'} · ${t('assistant')}`; }, { immediate: true });

async function loadConfig() {
  error.value = '';
  try {
    config.value = await getShopConfig();
    staticHost.value = isStaticHost();
    // 本地设置要在第一次生成前进入会话：接口地址、模型名与本机保存的密钥都以此为准。
    if (staticHost.value) syncAiSession();
  } catch { error.value = 'loadError'; }
}

function blankSettingsForm() {
  const settings = readSettings();
  return {
    storeName: settings.storeName,
    storeCity: settings.storeCity,
    googleReviewUrl: settings.googleReviewUrl,
    xiaohongshuUrl: settings.xiaohongshuUrl,
    aiBaseUrl: settings.aiBaseUrl,
    aiModel: settings.aiModel,
    aiKey: getStoredKey(),
  };
}
// 把本机设置同步进会话与界面；密钥已选保存时，重新打开页面会直接续上。
function syncAiSession() {
  const settings = readSettings();
  configureBrowserAI({ apiKey: getStoredKey(), baseUrl: settings.aiBaseUrl, model: settings.aiModel });
  aiReady.value = hasBrowserKey();
  aiCount.value = sessionUsage();
}
// 静态托管下，本机设置就是页面上的「环境变量」：同步给店铺信息与平台入口。
function applyStoreToConfig(settings) {
  if (!config.value) return;
  const store = { name: settings.storeName, city: settings.storeCity };
  config.value = {
    ...config.value,
    store,
    urls: {
      ...config.value.urls,
      Google: settings.googleReviewUrl || defaultGoogleUrl(store),
      小红书: settings.xiaohongshuUrl,
    },
  };
}
function openSettings(focusKey = false, opener = null) {
  settingsError.value = '';
  settingsForm.value = blankSettingsForm();
  settingsHasKey.value = readSettings().hasKey;
  settingsOpener.value = opener;
  settingsOpen.value = true;
  // 密钥被拒绝后自动打开时，焦点直接落在密钥框，让评审者当场换一把。
  nextTick(() => (focusKey ? settingsKeyEl.value : settingsFirstEl.value)?.focus());
}
function closeSettings(returnFocus = false) {
  if (!settingsOpen.value) return;
  settingsOpen.value = false;
  if (returnFocus) nextTick(() => settingsOpener.value?.focus());
}
function toggleSettings(opener) {
  if (settingsOpen.value) closeSettings(true);
  else openSettings(false, opener);
}
function saveLocalSettings() {
  settingsError.value = '';
  const form = settingsForm.value;
  const key = form.aiKey.trim();
  if (key && !normalizeKey(key)) { settingsError.value = 'settingsKeyFormatError'; return; }
  let settings;
  try {
    settings = saveSettings({
      storeName: form.storeName, storeCity: form.storeCity,
      googleReviewUrl: form.googleReviewUrl, xiaohongshuUrl: form.xiaohongshuUrl,
      aiBaseUrl: form.aiBaseUrl, aiModel: form.aiModel,
    });
  } catch (err) {
    // 地址不合法时抛出稳定文案键，原位提示，不写坏配置。
    settingsError.value = err.message;
    return;
  }
  // 密钥的去留以面板为准：填了才写入（混淆后），留空则连本机存储里那份一起清掉，
  // 否则只清内存的话，刷新页面密钥又会从 localStorage 续上。
  if (key) setStoredKey(key); else clearStoredKey();
  syncAiSession();
  applyStoreToConfig(settings);
  settingsHasKey.value = settings.hasKey;
  settingsForm.value.aiKey = key;
  closeSettings(true);
  notice.value = 'settingsSaved';
  confirmed.value = false;
}
function clearLocalKey() {
  // 存储里那份也要一起清：只清内存时，刷新后密钥照样续上，按钮就名不副实了。
  clearStoredKey();
  clearBrowserKey();
  syncAiSession();
  settingsForm.value.aiKey = '';
  settingsHasKey.value = false;
  settingsError.value = '';
}
function resetLocalSettings() {
  resetSettings();
  clearBrowserKey();
  syncAiSession();
  applyStoreToConfig(readSettings());
  settingsForm.value = blankSettingsForm();
  settingsHasKey.value = false;
  settingsError.value = '';
  notice.value = 'settingsResetDone';
  confirmed.value = false;
}
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown);
  void loadConfig();
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

function toggleTag(tag) {
  if (isLoading.value) return;
  if (selectedTags.value.includes(tag)) selectedTags.value = selectedTags.value.filter(item => item !== tag);
  else if (selectedTags.value.length < 2) selectedTags.value.push(tag);
  confirmed.value = false;
  notice.value = '';
}

function toggleLanguage() {
  if (languageOpen.value) { closeLanguage(true); return; }
  languageOpen.value = true;
  // 打开后把焦点放进菜单(定位到当前语言)，键盘用户可立即用方向键切换。
  nextTick(() => {
    const items = [...(pickerElement.value?.querySelectorAll('button[role="menuitemradio"]') || [])];
    (items.find(item => item.getAttribute('aria-checked') === 'true') || items[0])?.focus();
  });
}
function closeLanguage(returnFocus = false) {
  if (!languageOpen.value) return;
  languageOpen.value = false;
  if (returnFocus) nextTick(() => pickerButton.value?.focus());
}
function chooseLanguage(code) {
  locale.value = code;
  closeLanguage(true);
}
// 点击语言区域以外的任何地方都收起菜单，避免菜单遮挡、干扰页面其余操作。
function onDocumentPointerDown(event) {
  if (languageOpen.value && pickerElement.value && !pickerElement.value.contains(event.target)) closeLanguage();
  // 设置面板同理：点面板与触发按钮以外的地方就收起；触发按钮交给自己的 click 决定开关。
  if (settingsOpen.value && settingsPanel.value && !settingsPanel.value.contains(event.target)
    && !settingsOpener.value?.contains(event.target)) closeSettings();
}
// 菜单内键盘导航：方向键移动、Home/End 跳转、Esc 收起并把焦点还给图标按钮。
function onMenuKeydown(event) {
  const items = [...(pickerElement.value?.querySelectorAll('button[role="menuitemradio"]') || [])];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement);
  const move = step => { event.preventDefault(); items[(index + step + items.length) % items.length].focus(); };
  if (event.key === 'ArrowDown') move(1);
  else if (event.key === 'ArrowUp') move(-1);
  else if (event.key === 'Home') { event.preventDefault(); items[0].focus(); }
  else if (event.key === 'End') { event.preventDefault(); items[items.length - 1].focus(); }
  else if (event.key === 'Escape') { event.preventDefault(); closeLanguage(true); }
}
// 焦点完全离开菜单(例如按 Tab)时自动收起。
function onMenuFocusout(event) {
  const next = event.relatedTarget;
  if (!(next instanceof Node) || !pickerElement.value?.contains(next)) closeLanguage();
}

async function generateReview() {
  if (!config.value || isLoading.value || !selectedTags.value.length) return;
  // 保存本次请求快照：评价必须和生成时的平台、标签绑定。
  const request = { tags: [...selectedTags.value], platform: selectedPlatform.value, language: outputLanguage.value };
  const requestSignature = signature.value;
  isLoading.value = true;
  error.value = ''; notice.value = ''; confirmed.value = false;
  try {
    const data = await requestReview(request);
    // 仅在成功后替换，失败时保留顾客已经编辑的内容。
    generatedContent.value = data.content;
    generatedFor.value = { signature: requestSignature, platform: request.platform, language: data.language || request.language, ai: !data.demo };
    aiCount.value = sessionUsage();
    notice.value = 'ready';
  } catch (err) {
    // 本机密钥被明确拒绝时移除并重新弹出设置面板，让评审者当场换一把密钥重试。
    if (err?.clearKey) { clearBrowserKey(); aiReady.value = false; openSettings(true); }
    error.value = err.name === 'TimeoutError' ? 'timeout' : err instanceof TypeError ? 'networkError'
      : BROWSER_ERROR_KEYS.has(err.message) || Object.values(ERROR_KEYS).includes(err.message) ? err.message : 'serverError';
  } finally { isLoading.value = false; }
}

async function copyAndRedirect() {
  if (!canCopy.value || copying.value) return;
  copying.value = true; notice.value = '';
  const hasTarget = !!targetUrl.value;
  // 在用户点击的同步阶段预留窗口，避免等待剪贴板后被浏览器拦截；没有目标链接就不用开窗。
  const popup = hasTarget ? window.open('about:blank', '_blank') : null;
  if (popup) popup.opener = null;
  let copied = false;
  try {
    await navigator.clipboard.writeText(generatedContent.value.trim());
    copied = true;
  } catch {
    // 剪贴板不可用（如非 HTTPS/手机浏览器）时，仍打开平台入口，改用手动复制。
    editor.value?.focus(); editor.value?.select();
  }
  if (popup) {
    // 平台页面始终打开；复制成不成功只影响提示文案。
    popup.location.replace(targetUrl.value);
    notice.value = copied ? 'opened' : 'copyFailed';
  } else if (copied) {
    notice.value = hasTarget ? 'blocked' : 'copied';
  } else {
    notice.value = 'copyFailed';
  }
  copying.value = false;
}
</script>

<template>
  <div class="site-shell">
    <header class="site-header">
      <a class="brand" href="./" :aria-label="t('home')">
        <img src="/cup.svg" width="44" height="44" alt="" />
        <span>{{ config?.store.name || 'Sunny Tea House' }}<small>{{ t('tagline') }}</small></span>
      </a>
      <div class="header-meta">
        <div ref="pickerElement" class="language-picker">
          <button ref="pickerButton" class="globe-button" type="button"
            :aria-expanded="languageOpen" aria-haspopup="menu"
            :aria-controls="languageOpen ? languageMenuId : undefined"
            :aria-label="languageButtonLabel" @click="toggleLanguage">
            <svg class="translate-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3.4a13 13 0 0 1 0 17.2M12 3.4a13 13 0 0 0 0 17.2"/></svg>
            <svg class="translate-caret" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="currentColor"><path d="M7.3 9.3 12 14l4.7-4.7-1.4-1.4L12 11.2 8.7 7.9z"/></svg>
          </button>
          <div v-if="languageOpen" :id="languageMenuId" class="language-menu" role="menu" :aria-label="t('language')" @keydown="onMenuKeydown" @focusout="onMenuFocusout">
            <button v-for="language in LANGUAGES" :key="language.code" type="button" role="menuitemradio"
              :aria-checked="locale === language.code" :class="{ active: locale === language.code }"
              @click="chooseLanguage(language.code)">
              <span class="menu-check" aria-hidden="true">{{ locale === language.code ? '✓' : '' }}</span>{{ language.label }}</button>
          </div>
        </div>
        <button class="theme-toggle" type="button" role="switch" :aria-checked="theme === 'dark'" :aria-label="t('theme')" @click="toggleTheme">
          <span class="theme-track" aria-hidden="true">
            <span class="theme-knob">
              <svg v-if="theme === 'dark'" class="theme-moon" viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>
              <svg v-else class="theme-sun" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></svg>
            </span>
          </span>
        </button>
      </div>
    </header>

    <main>
      <section class="intro">
        <div><p class="eyebrow">ONE CUP, ONE WORD</p><h1>{{ t('hero1') }}<br class="mobile-break" /> {{ t('hero2') }}<span>{{ locale.startsWith('zh') ? '。' : '.' }}</span></h1><p class="intro-copy">{{ t('intro') }}</p></div>
        <div class="tea-stamp" aria-hidden="true"><span>现泡</span><b>茶</b><span>手作</span></div>
      </section>

      <div v-if="!config" class="connection-message" role="status"><p>{{ t(error || 'preparing') }}</p><button v-if="error" class="secondary" @click="loadConfig">{{ t('reconnect') }}</button></div>
      <div v-else class="workspace">
        <section class="selection-card" :aria-label="t('selection')">
          <div class="card-kicker"><span>{{ t('start') }}</span></div>
          <fieldset :disabled="isLoading">
            <legend><span class="step">01</span> {{ t('feeling') }}</legend>
            <p class="field-hint">{{ t('pick') }}<span>{{ selectedTags.length }}/2</span></p>
            <div class="tags"><button v-for="tag in config.tags" :key="tag" type="button" :aria-pressed="selectedTags.includes(tag)" :disabled="!selectedTags.includes(tag) && selectedTags.length >= 2" :class="['tag', { selected: selectedTags.includes(tag) }]" @click="toggleTag(tag)"><span aria-hidden="true">{{ selectedTags.includes(tag) ? '✓' : '+' }}</span>{{ t(tag) }}</button></div>
          </fieldset>
          <fieldset class="platform-field" :disabled="isLoading">
            <legend><span class="step">02</span> {{ t('where') }}</legend>
            <p class="field-hint">{{ t('platformHint') }}</p>
            <div class="platforms"><label v-for="platform in platforms" :key="platform.name" :class="['platform', { active: selectedPlatform === platform.name }]"><input v-model="selectedPlatform" type="radio" name="platform" :value="platform.name" @change="confirmed = false; notice = ''" /><span :class="['platform-mark', platform.className]">{{ platform.mark }}</span><strong>{{ platformName(platform.name) }}</strong><small>{{ t(platform.detail) }}</small><span class="radio-dot" aria-hidden="true"></span></label></div>
          </fieldset>
          <button class="primary generate" :disabled="!selectedTags.length || isLoading" @click="generateReview"><span :class="{ spinner: isLoading }" aria-hidden="true">{{ isLoading ? '' : '✧' }}</span>{{ t(isLoading ? 'generating' : generatedContent ? 'regenerate' : 'generate') }}<span v-if="!isLoading" aria-hidden="true">↗</span></button>
          <p class="generation-note">{{ t(generationNote) }}</p>
          <p v-if="config.notificationEnabled" class="generation-note">{{ t('notifyNote') }}</p>
          <div v-if="staticDemo" class="ai-state">
            <p v-if="aiReady" class="ai-active">
              <span class="ai-dot" aria-hidden="true"></span>
              <span class="ai-active-text">{{ t('aiActiveState') }}<b class="ai-count">{{ t('aiSessionCount') }} {{ aiCount }}</b></span>
            </p>
            <button v-else class="ai-setup" type="button" :disabled="isLoading" @click="openSettings(false, $event.currentTarget)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>
              <span>{{ t('settingsOpen') }}</span>
            </button>
          </div>
          <p v-if="error" class="error-message" role="alert">{{ t(error) }}</p>
        </section>

        <section class="preview-card" :aria-busy="isLoading" :aria-label="t('previewAria')">
          <div class="preview-heading"><h2><span class="step">03</span> {{ t('yours') }}</h2><span class="draft-badge">{{ generatedFor ? platformName(generatedFor.platform) + ' · ' + t('draft') : t('preview') }}</span></div>
          <div class="draft-language">
            <span class="draft-language-label">{{ t('outputLanguage') }}</span>
            <div class="language-segments" role="radiogroup" :aria-label="t('outputLanguage')">
              <button v-for="option in languageOptions" :key="option.code" type="button" role="radio"
                :aria-checked="reviewLanguage === option.code" :class="['language-segment', { active: reviewLanguage === option.code }]"
                :disabled="isLoading" @click="setReviewLanguage(option.code)">{{ option.label }}</button>
            </div>
            <span class="draft-language-hint">{{ t('outputHint') }}</span>
          </div>
          <template v-if="generatedContent || generatedFor">
            <p class="field-hint">{{ t('editHint') }}</p>
            <label class="sr-only" for="review">{{ t('content') }}</label>
            <textarea id="review" ref="editor" v-model="generatedContent" :disabled="isLoading" :placeholder="t('placeholder')" :lang="generatedFor?.language" @input="confirmed = false; notice = ''"></textarea>
            <div class="editor-meta"><span>{{ languageName(generatedFor?.language) }} · {{ t(generatedFor?.ai ? 'aiDraft' : 'demoDraft') }}</span><span :class="{ 'over-limit': tooLong }">{{ characterCount }}{{ generatedFor?.platform === '小红书' ? ' / 150' : '' }} {{ t('characters') }}</span></div>
            <p v-if="stale" class="warning" role="status">{{ t('stale') }}</p>
            <p v-if="tooLong" class="warning" role="status">{{ t('tooLong') }}</p>
            <label class="confirm"><input v-model="confirmed" type="checkbox" :disabled="isLoading || !!stale" />{{ t('confirm') }}</label>
            <button class="primary copy" :disabled="!canCopy || copying" @click="copyAndRedirect">{{ t(copying ? 'copying' : targetUrl ? 'copyOpen' : 'copy') }}</button>
            <a v-if="targetUrl && !stale" class="manual-link" :href="targetUrl" target="_blank" rel="noopener noreferrer">{{ t('manual') }} {{ platformName(generatedFor.platform) }} ↗</a>
            <p v-else-if="!targetUrl" class="generation-note">{{ t('noGoogle') }}</p>
          </template>
          <div v-else class="empty-preview">
            <div class="tea-illustration" aria-hidden="true"><span class="spark one">✦</span><span class="spark two">✧</span><div class="straw"></div><div class="cup"><div class="tea-liquid"></div><div class="cup-label"><img src="/cup.svg" alt="" width="30" height="30" /><span>SUNNY TEA</span></div><i></i><i></i><i></i></div><div class="cup-shadow"></div></div>
            <h3>{{ t(isLoading ? 'brewing' : 'emptyTitle') }}</h3><p>{{ t(isLoading ? 'waiting' : 'emptyHint') }}</p>
          </div>
          <p v-if="notice" class="notice" role="status">{{ t(notice) }}</p>
          <div class="preview-foot"><span aria-hidden="true">✳</span> {{ t('foot') }}</div>
        </section>
      </div>
      <div class="bottom-note"><span>{{ t('bottom') }}</span><span>{{ t('step1') }} <b>→</b> {{ t('step2') }} <b>→</b> {{ t('step3') }}</span></div>
    </main>
    <!-- 静态托管没有服务端：右下角设置面板承载这些本该由环境变量提供的配置。 -->
    <template v-if="staticHost">
      <button class="settings-fab" type="button"
        :aria-expanded="settingsOpen" aria-controls="settings-panel"
        :aria-label="t('settingsFabAria')" @click="toggleSettings($event.currentTarget)">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3"/><path d="M14 4v4M8 12v4M14 20v4"/></svg>
      </button>
      <div v-if="settingsOpen" id="settings-panel" ref="settingsPanel" class="settings-panel" role="dialog" aria-labelledby="settings-title" @keydown.esc.prevent="closeSettings(true)">
        <div class="settings-head">
          <div>
            <p class="settings-kicker">GITHUB PAGES · LOCAL</p>
            <h2 id="settings-title">{{ t('settingsTitle') }}</h2>
          </div>
          <button class="settings-close" type="button" :aria-label="t('settingsClose')" @click="closeSettings(true)">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <p class="settings-intro">{{ t('settingsIntro') }}</p>
        <fieldset class="settings-group" :disabled="isLoading">
          <legend>{{ t('settingsGroupShop') }}</legend>
          <label class="settings-field">
            <span>{{ t('settingsStore') }}</span>
            <input ref="settingsFirstEl" v-model="settingsForm.storeName" type="text" maxlength="40" autocomplete="off" />
          </label>
          <label class="settings-field">
            <span>{{ t('settingsCity') }}</span>
            <input v-model="settingsForm.storeCity" type="text" maxlength="40" autocomplete="off" />
          </label>
          <label class="settings-field">
            <span>{{ t('settingsGoogle') }}</span>
            <input v-model="settingsForm.googleReviewUrl" type="url" inputmode="url" spellcheck="false" placeholder="https://g.page/..." />
          </label>
          <label class="settings-field">
            <span>{{ t('settingsXhs') }}</span>
            <input v-model="settingsForm.xiaohongshuUrl" type="url" inputmode="url" spellcheck="false" placeholder="https://www.xiaohongshu.com/" />
          </label>
        </fieldset>
        <fieldset class="settings-group" :disabled="isLoading">
          <legend>{{ t('settingsGroupAi') }}</legend>
          <label class="settings-field">
            <span>{{ t('settingsBaseUrl') }}</span>
            <input v-model="settingsForm.aiBaseUrl" type="url" inputmode="url" spellcheck="false" placeholder="https://api.deepseek.com" />
          </label>
          <p class="settings-hint">{{ t('settingsBaseUrlHint') }}</p>
          <label class="settings-field">
            <span>{{ t('settingsModel') }}</span>
            <input v-model="settingsForm.aiModel" type="text" spellcheck="false" placeholder="deepseek-v4-flash" />
          </label>
          <label class="settings-field">
            <span>{{ t('settingsKey') }}</span>
            <input ref="settingsKeyEl" v-model="settingsForm.aiKey" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" :placeholder="t('settingsKeyPlaceholder')" @keydown.enter.prevent="saveLocalSettings" />
          </label>
          <p class="settings-hint">{{ t('settingsKeyHint') }}</p>
          <p class="settings-hint">{{ t('settingsNotifyLimit') }}</p>
        </fieldset>
        <p v-if="settingsError" class="settings-error" role="alert">{{ t(settingsError) }}</p>
        <div class="settings-actions">
          <button class="settings-save" type="button" :disabled="isLoading" @click="saveLocalSettings">{{ t('settingsSave') }}</button>
          <button class="settings-clear" type="button" :disabled="!settingsHasKey" @click="clearLocalKey">{{ t('settingsClearKey') }}</button>
          <button class="settings-reset" type="button" @click="resetLocalSettings">{{ t('settingsResetBtn') }}</button>
        </div>
      </div>
    </template>
    <footer><span>© {{ new Date().getFullYear() }} {{ config?.store.name || 'Sunny Tea House' }}</span><span>{{ t('fictional') }} · {{ config?.store.city || 'San Jose' }}</span></footer>
  </div>
</template>
