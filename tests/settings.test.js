import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, DEFAULT_SETTINGS, readSettings, saveSettings, resetSettings,
  normalizeBaseUrl, aiEndpointFrom, normalizePlatformUrl, defaultGoogleUrl,
  getStoredKey, hasStoredKey, setStoredKey, clearStoredKey } from '../src/settings.js';

// 浏览器存储的最小替身：slice 出真实 localStorage 的语义（get/set/remove/clear）。
class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}
globalThis.localStorage = new MemoryStorage();

beforeEach(() => localStorage.clear());

test('没有本机配置时读取默认值，且未标记密钥', () => {
  const settings = readSettings();
  assert.equal(settings.storeName, '一茶一言');
  assert.equal(settings.storeCity, 'San Jose');
  assert.equal(settings.googleReviewUrl, '');
  assert.equal(settings.xiaohongshuUrl, 'https://www.xiaohongshu.com/');
  assert.equal(settings.aiBaseUrl, 'https://api.deepseek.com');
  assert.equal(settings.aiModel, 'deepseek-v4-flash');
  assert.equal(settings.hasKey, false);
});

test('读取时逐项清洗脏值：空白与非白名单链接回落默认', () => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    storeName: '   ', storeCity: 'Fremont',
    googleReviewUrl: 'https://evilgoogle.com/review', xiaohongshuUrl: 'ftp://xiaohongshu.com',
    aiBaseUrl: 'http://evil.example.com', aiModel: '  ',
  }));
  const settings = readSettings();
  assert.equal(settings.storeName, DEFAULT_SETTINGS.storeName);
  assert.equal(settings.storeCity, 'Fremont');
  assert.equal(settings.googleReviewUrl, '');
  assert.equal(settings.xiaohongshuUrl, DEFAULT_SETTINGS.xiaohongshuUrl);
  assert.equal(settings.aiBaseUrl, DEFAULT_SETTINGS.aiBaseUrl);
  assert.equal(settings.aiModel, DEFAULT_SETTINGS.aiModel);
});

test('存储内容不是合法 JSON 时同样回落默认，页面不崩', () => {
  localStorage.setItem(SETTINGS_KEY, '{not json');
  assert.equal(readSettings().storeName, DEFAULT_SETTINGS.storeName);
});

test('保存与读取往返：店铺、平台链接、服务商地址与模型名按填写生效', () => {
  saveSettings({
    storeName: 'Hill Tea', storeCity: 'Fremont',
    googleReviewUrl: 'https://g.page/r/hill-tea', xiaohongshuUrl: 'https://www.xiaohongshu.com/user/profile/66',
    aiBaseUrl: 'https://models.example.org/v1', aiModel: 'my-model',
  });
  const settings = readSettings();
  assert.equal(settings.storeName, 'Hill Tea');
  assert.equal(settings.storeCity, 'Fremont');
  assert.equal(settings.googleReviewUrl, 'https://g.page/r/hill-tea');
  assert.equal(settings.xiaohongshuUrl, 'https://www.xiaohongshu.com/user/profile/66');
  assert.equal(settings.aiBaseUrl, 'https://models.example.org/v1');
  assert.equal(settings.aiModel, 'my-model');
});

test('接口地址归一化：剥掉尾部斜杠与 /chat/completions 后缀，本机允许 HTTP', () => {
  assert.equal(normalizeBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl('https://api.example.com/v1/chat/completions/'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl(''), '');
  assert.equal(normalizeBaseUrl(null), '');
  assert.equal(normalizeBaseUrl('http://localhost:8080/v1'), 'http://localhost:8080/v1');
  assert.equal(normalizeBaseUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  for (const bad of ['api.example.com', 'http://api.example.com', 'ftp://api.example.com', 'https://']) {
    assert.throws(() => normalizeBaseUrl(bad), { message: 'settingsErrorBase' }, bad);
  }
});

test('补全接口端点：重复传入完整端点也不会拼出两层 /chat/completions', () => {
  assert.equal(aiEndpointFrom('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
  assert.equal(aiEndpointFrom('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1/chat/completions');
  assert.equal(aiEndpointFrom('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions');
});

test('平台链接只接受对应平台的 HTTPS 地址', () => {
  const google = ['google.com', 'g.page', 'maps.app.goo.gl'];
  const xhs = ['xiaohongshu.com', 'xhslink.com'];
  assert.equal(normalizePlatformUrl('https://g.page/r/abc', google), 'https://g.page/r/abc');
  assert.equal(normalizePlatformUrl('https://maps.app.goo.gl/maps?x=1', google), 'https://maps.app.goo.gl/maps?x=1');
  assert.equal(normalizePlatformUrl('https://www.xiaohongshu.com/user/profile/66', xhs), 'https://www.xiaohongshu.com/user/profile/66');
  assert.equal(normalizePlatformUrl('https://xhslink.com/a/abcdef', xhs), 'https://xhslink.com/a/abcdef');
  assert.equal(normalizePlatformUrl('', google), '');
  for (const bad of ['https://evilgoogle.com/review', 'http://g.page/r/abc',
    'https://user:pass@google.com', 'javascript:alert(1)', 'g.page/r/abc', 'https://xiaohongshu.com.evil.cn/x']) {
    assert.throws(() => normalizePlatformUrl(bad, google), { message: 'settingsErrorPlatform' }, bad);
  }
});

test('非法地址在保存时抛文案键，且不会写坏已有的配置', () => {
  saveSettings({ storeName: 'Hill Tea', googleReviewUrl: 'https://g.page/r/hill-tea' });
  const before = readSettings();
  const cases = [
    [{ googleReviewUrl: 'https://evilgoogle.com' }, 'settingsErrorPlatform'],
    [{ googleReviewUrl: 'javascript:alert(1)' }, 'settingsErrorPlatform'],
    [{ xiaohongshuUrl: 'https://not-xhs.com' }, 'settingsErrorPlatform'],
    [{ aiBaseUrl: 'http://api.example.com' }, 'settingsErrorBase'],
    [{ aiBaseUrl: ' nonsense ' }, 'settingsErrorBase'],
  ];
  for (const [patch, code] of cases) {
    assert.throws(() => saveSettings({ storeName: before.storeName, ...patch }), { message: code });
    assert.deepEqual(readSettings(), before);
  }
});

test('恢复默认：配置与密钥一并清除', () => {
  saveSettings({ storeName: 'Hill Tea', storeCity: 'Fremont' });
  setStoredKey('sk-0123456789abcdefghij');
  assert.equal(hasStoredKey(), true);
  const settings = resetSettings();
  assert.equal(settings.storeName, DEFAULT_SETTINGS.storeName);
  assert.equal(settings.storeCity, DEFAULT_SETTINGS.storeCity);
  assert.equal(settings.hasKey, false);
  assert.equal(getStoredKey(), '');
  assert.equal(localStorage.getItem(SETTINGS_KEY), null);
});

test('Google 未填商家链接时，默认跳到地图搜索该店', () => {
  const url = defaultGoogleUrl({ name: 'Hill Tea', city: 'Fremont' });
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
  assert.ok(url.includes(encodeURIComponent('Hill Tea Fremont')));
});

test('密钥以混淆形式落盘：序列化结果不含原文但可完整还原', () => {
  const key = 'sk-0123456789abcdefghij';
  saveSettings({ storeName: 'Hill Tea' });
  assert.equal(setStoredKey(' ' + key + ' '), true);
  const raw = localStorage.getItem(SETTINGS_KEY);
  assert.ok(!raw.includes(key), 'localStorage 不应出现密钥原文');
  assert.ok(!raw.includes('sk-0123456789'));
  assert.equal(JSON.parse(raw).storeName, 'Hill Tea');
  assert.equal(getStoredKey(), key);
  assert.equal(hasStoredKey(), true);
  assert.equal(readSettings().hasKey, true);
});

test('清除密钥只移除密钥本身，其余配置保留', () => {
  saveSettings({ storeName: 'Hill Tea', storeCity: 'Fremont' });
  setStoredKey('sk-0123456789abcdefghij');
  assert.equal(clearStoredKey(), true);
  assert.equal(hasStoredKey(), false);
  assert.equal(getStoredKey(), '');
  assert.deepEqual(readSettings(), { ...readSettings(), hasKey: false });
  assert.equal(readSettings().storeName, 'Hill Tea');
  assert.equal(readSettings().storeCity, 'Fremont');
  assert.equal(clearStoredKey(), true);
  // 空值写入等价于清除。
  setStoredKey('sk-0123456789abcdefghij');
  setStoredKey('');
  assert.equal(hasStoredKey(), false);
});

test('保存配置不会覆盖已经存好的密钥', () => {
  saveSettings({ storeName: 'Hill Tea' });
  setStoredKey('sk-0123456789abcdefghij');
  saveSettings({ storeName: '一茶一言', aiModel: 'other-model' });
  assert.equal(getStoredKey(), 'sk-0123456789abcdefghij');
  assert.equal(readSettings().aiModel, 'other-model');
});

test('存储不可用时写入静默失败，读取仍然给出可用配置', () => {
  const realSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(setStoredKey('sk-0123456789abcdefghij'), false);
  assert.equal(saveSettings({ storeName: 'Hill Tea' }).storeName, DEFAULT_SETTINGS.storeName);
  localStorage.setItem = realSetItem;
  saveSettings({ storeName: 'Hill Tea' });
  // removeItem 抛错时也不能打断恢复默认，只是本次确实清不掉。
  const realRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.removeItem = () => { throw new Error('denied'); };
  assert.equal(resetSettings().storeName, 'Hill Tea');
  localStorage.removeItem = realRemoveItem;
  assert.equal(resetSettings().storeName, DEFAULT_SETTINGS.storeName);
});
