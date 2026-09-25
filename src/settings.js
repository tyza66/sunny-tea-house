// 静态托管（GitHub Pages 等）没有服务端，读不到任何环境变量：服务端同等的配置
// 只能保存在访客自己的浏览器里，只在本机生效，请求也不经过本站任何服务器。
// 店铺信息、平台链接与 AI 服务地址按明文保存，便于迁移与核对；AI 密钥可以保存，
// 但写入 localStorage 前先做一次可逆混淆，避免被顺手扫到原文——这是防窥探，
// 不是加密强度（密钥终究要在浏览器里使用，脚本与混淆口令同在客户端）。
export const SETTINGS_KEY = 'sunny.settings';
const DEFAULT_SETTINGS = {
  storeName: 'Sunny Tea House',
  storeCity: 'San Jose',
  googleReviewUrl: '',
  xiaohongshuUrl: 'https://www.xiaohongshu.com/',
  aiBaseUrl: 'https://api.deepseek.com',
  aiModel: 'deepseek-v4-flash',
};
// 与服务端 server/config.js 保持同一份域名白名单，两种托管行为一致。
const GOOGLE_DOMAINS = ['google.com', 'g.page', 'maps.app.goo.gl'];
const XHS_DOMAINS = ['xiaohongshu.com', 'xhslink.com'];
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const OBSCURE_PASSPHRASE = 'sunny-tea-house · local only';

function readRaw() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; }
  catch { return {}; }
}
function writeRaw(value) {
  // 隐私浏览或存储被禁用时保持本次页面可用，不因写失败而中断配置。
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); return true; }
  catch { return false; }
}
// 可逆混淆：XOR 掉一段固定口令再转 base64。防的是“被顺手扫到原文”，不是加密强度。
function obscure(text) {
  const bytes = new TextEncoder().encode(text);
  const mask = new TextEncoder().encode(OBSCURE_PASSPHRASE);
  let binary = '';
  bytes.forEach((byte, index) => { binary += String.fromCharCode(byte ^ mask[index % mask.length]); });
  return btoa(binary);
}
function reveal(token) {
  try {
    const bytes = Uint8Array.from(atob(String(token ?? '')), char => char.charCodeAt(0));
    const mask = new TextEncoder().encode(OBSCURE_PASSPHRASE);
    return new TextDecoder().decode(bytes.map((byte, index) => byte ^ mask[index % mask.length]));
  } catch { return ''; }
}
const text = value => (typeof value === 'string' ? value.trim() : '');

// 只校验并清洗地址本身；公网必须 HTTPS，本机自测允许 HTTP（与服务端一致）。
export function normalizeBaseUrl(raw) {
  const value = text(raw);
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('settingsErrorBase'); }
  const local = LOCAL_HOSTS.includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('settingsErrorBase');
  // 顾客常直接粘贴完整端点，这里统一归一化成“域名/路径前缀”，再补 /chat/completions。
  const path = url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return `${url.origin}${path}`;
}
export function aiEndpointFrom(base) {
  // 兜底再剥一次：即使传入的是完整端点，也不会拼出重复路径。
  const path = text(base).replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  return `${path}/chat/completions`;
}
export function normalizePlatformUrl(raw, domains) {
  const value = text(raw);
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch { throw new Error('settingsErrorPlatform'); }
  if (url.protocol !== 'https:' || url.username || url.password
    || !domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new Error('settingsErrorPlatform');
  }
  return url.href;
}
// Google 未配置商家链接时，默认跳到 Google 地图搜索该店（与服务端口径一致）。
export function defaultGoogleUrl(store) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.city}`)}`;
}
function safeBaseUrl(raw) { try { return normalizeBaseUrl(raw); } catch { return ''; } }
function safePlatformUrl(raw, domains) { try { return normalizePlatformUrl(raw, domains); } catch { return ''; } }

// 读取时做一次清洗：手改 localStorage 造成的脏值回落到默认值，页面不会因此崩。
export function readSettings() {
  const raw = readRaw();
  const settings = {
    storeName: text(raw.storeName) || DEFAULT_SETTINGS.storeName,
    storeCity: text(raw.storeCity) || DEFAULT_SETTINGS.storeCity,
    googleReviewUrl: safePlatformUrl(raw.googleReviewUrl, GOOGLE_DOMAINS),
    xiaohongshuUrl: safePlatformUrl(raw.xiaohongshuUrl, XHS_DOMAINS) || DEFAULT_SETTINGS.xiaohongshuUrl,
    aiBaseUrl: safeBaseUrl(raw.aiBaseUrl) || DEFAULT_SETTINGS.aiBaseUrl,
    aiModel: text(raw.aiModel) || DEFAULT_SETTINGS.aiModel,
  };
  settings.hasKey = getStoredKey().length > 0;
  return settings;
}
// 保存前严格校验：地址不合法时抛出稳定文案键，由面板原位提示，不写坏配置。
export function saveSettings(patch = {}) {
  const next = {
    storeName: text(patch.storeName) || DEFAULT_SETTINGS.storeName,
    storeCity: text(patch.storeCity) || DEFAULT_SETTINGS.storeCity,
    googleReviewUrl: normalizePlatformUrl(patch.googleReviewUrl, GOOGLE_DOMAINS),
    xiaohongshuUrl: normalizePlatformUrl(patch.xiaohongshuUrl, XHS_DOMAINS) || DEFAULT_SETTINGS.xiaohongshuUrl,
    aiBaseUrl: normalizeBaseUrl(patch.aiBaseUrl) || DEFAULT_SETTINGS.aiBaseUrl,
    aiModel: text(patch.aiModel) || DEFAULT_SETTINGS.aiModel,
  };
  writeRaw({ ...next, key: readRaw().key });
  return readSettings();
}
export function resetSettings() {
  try { localStorage.removeItem(SETTINGS_KEY); } catch { /* 存储不可用时仅清理内存态。 */ }
  return readSettings();
}

export function getStoredKey() { return reveal(readRaw().key); }
export function hasStoredKey() { return getStoredKey().length > 0; }
export function setStoredKey(raw) {
  const key = text(raw);
  if (!key) return clearStoredKey();
  return writeRaw({ ...readRaw(), key: obscure(key) });
}
export function clearStoredKey() {
  const raw = readRaw();
  if (!('key' in raw)) return true;
  delete raw.key;
  return writeRaw(raw);
}
export { DEFAULT_SETTINGS };
