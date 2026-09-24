import test from 'node:test';
import assert from 'node:assert/strict';
import { getShopConfig, requestReview } from '../src/api.js';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('getShopConfig 优先读取后端配置', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(200, { store: { name: 'API 店', city: '测试城' }, demo: false, tags: ['服务好'], urls: {}, notificationEnabled: false });
  try {
    const config = await getShopConfig();
    assert.equal(config.store.name, 'API 店');
    assert.equal(config.demo, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('getShopConfig 在接口 404 时回退为本地演示配置', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(404, {});
  try {
    const config = await getShopConfig();
    assert.equal(config.demo, true);
    assert.equal(config.store.name, 'Sunny Tea House');
    assert.ok(config.tags.length >= 6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestReview 在接口 404 时返回本地演示文案', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(404, {});
  try {
    const result = await requestReview({ platform: 'Google', tags: ['服务好'], language: 'auto' });
    assert.equal(result.demo, true);
    assert.equal(result.language, 'en');
    assert.ok(result.content.includes('Sunny Tea House'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestReview 网络失败时回退为本地演示文案', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  try {
    const result = await requestReview({ platform: '小红书', tags: ['茶香浓郁'], language: 'auto' });
    assert.equal(result.demo, true);
    assert.equal(result.language, 'zh-CN');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestReview 保留后端的密钥错误，不回退为演示', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(500, { error: '生成服务的密钥无效，请联系店家检查配置。' });
  try {
    await assert.rejects(() => requestReview({ platform: 'Google', tags: ['服务好'], language: 'en' }), /keyError/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
