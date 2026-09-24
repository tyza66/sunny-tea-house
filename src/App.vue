<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { LANGUAGES, isLanguage, resolveLanguage, ERROR_KEYS } from '../shared/languages.js';
import { useI18n, readPreference, savePreference } from './i18n.js';
import { getShopConfig, requestReview } from './api.js';

const { locale, t } = useI18n();

const THEME_KEY = 'sunny.theme';
const theme = ref(readPreference(THEME_KEY, '') || 'light');
function applyTheme() {
  document.documentElement.dataset.theme = theme.value;
  document.documentElement.style.colorScheme = theme.value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.value === 'dark' ? '#14180f' : '#faf9f6');
}
watch(theme, value => { savePreference(THEME_KEY, value); applyTheme(); }, { immediate: true });
function toggleTheme() { theme.value = theme.value === 'dark' ? 'light' : 'dark'; }
const savedOutput = readPreference('sunny.reviewLanguage', 'auto');
const reviewLanguage = ref(isLanguage(savedOutput) ? savedOutput : 'auto');
watch(reviewLanguage, value => { savePreference('sunny.reviewLanguage', value); confirmed.value = false; notice.value = ''; });

const config = ref(null);
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
watch([locale, config], () => { document.title = `${config.value?.store.name || 'Sunny Tea House'} · ${t('assistant')}`; }, { immediate: true });

async function loadConfig() {
  error.value = '';
  try {
    config.value = await getShopConfig();
  } catch { error.value = 'loadError'; }
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
    generatedFor.value = { signature: requestSignature, platform: request.platform, language: data.language || request.language };
    notice.value = 'ready';
  } catch (err) {
    error.value = err.name === 'TimeoutError' ? 'timeout' : err instanceof TypeError ? 'networkError' : Object.values(ERROR_KEYS).includes(err.message) ? err.message : 'serverError';
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
      <a class="brand" href="/" :aria-label="t('home')">
        <img src="/sun.svg" width="44" height="44" alt="" />
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
        <div><p class="eyebrow">YOUR TEA, YOUR WORDS</p><h1>{{ t('hero1') }}<br class="mobile-break" /> {{ t('hero2') }}<span>{{ locale.startsWith('zh') ? '。' : '.' }}</span></h1><p class="intro-copy">{{ t('intro') }}</p></div>
        <div class="tea-stamp" aria-hidden="true"><span>FRESHLY</span><b>茶</b><span>BREWED</span></div>
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
          <p class="generation-note">{{ t(config.demo ? 'demoNote' : 'aiNote') }}</p>
          <p v-if="config.notificationEnabled" class="generation-note">{{ t('notifyNote') }}</p>
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
            <div class="editor-meta"><span>{{ languageName(generatedFor?.language) }} · {{ t(config.demo ? 'demoDraft' : 'aiDraft') }}</span><span :class="{ 'over-limit': tooLong }">{{ characterCount }}{{ generatedFor?.platform === '小红书' ? ' / 150' : '' }} {{ t('characters') }}</span></div>
            <p v-if="stale" class="warning" role="status">{{ t('stale') }}</p>
            <p v-if="tooLong" class="warning" role="status">{{ t('tooLong') }}</p>
            <label class="confirm"><input v-model="confirmed" type="checkbox" :disabled="isLoading || !!stale" />{{ t('confirm') }}</label>
            <button class="primary copy" :disabled="!canCopy || copying" @click="copyAndRedirect">{{ t(copying ? 'copying' : targetUrl ? 'copyOpen' : 'copy') }}</button>
            <a v-if="targetUrl && !stale" class="manual-link" :href="targetUrl" target="_blank" rel="noopener noreferrer">{{ t('manual') }} {{ platformName(generatedFor.platform) }} ↗</a>
            <p v-else-if="!targetUrl" class="generation-note">{{ t('noGoogle') }}</p>
          </template>
          <div v-else class="empty-preview">
            <div class="tea-illustration" aria-hidden="true"><span class="spark one">✦</span><span class="spark two">✧</span><div class="straw"></div><div class="cup"><div class="tea-liquid"></div><div class="cup-label"><img src="/sun.svg" alt="" width="30" height="30" /><span>SUNNY TEA</span></div><i></i><i></i><i></i></div><div class="cup-shadow"></div></div>
            <h3>{{ t(isLoading ? 'brewing' : 'emptyTitle') }}</h3><p>{{ t(isLoading ? 'waiting' : 'emptyHint') }}</p>
          </div>
          <p v-if="notice" class="notice" role="status">{{ t(notice) }}</p>
          <div class="preview-foot"><span aria-hidden="true">✳</span> {{ t('foot') }}</div>
        </section>
      </div>
      <div class="bottom-note"><span>{{ t('bottom') }}</span><span>{{ t('step1') }} <b>→</b> {{ t('step2') }} <b>→</b> {{ t('step3') }}</span></div>
    </main>
    <footer><span>© {{ new Date().getFullYear() }} {{ config?.store.name || 'Sunny Tea House' }}</span><span>{{ t('fictional') }} · {{ config?.store.city || 'San Jose' }}</span></footer>
  </div>
</template>
