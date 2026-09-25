import test from 'node:test';
import assert from 'node:assert/strict';
import { getShopConfig, requestReview, isStaticHost } from '../src/api.js';

const BACKEND_CONFIG = { store: { name: 'API 店', city: '测试城' }, demo: false, tags: ['服务好'], urls: {}, notificationEnabled: false };

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function withFetch(impl, run) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// 页面总是先读 /api/config 再生成；一次成功的配置请求把静态回退标志复位。
async function useBackendMode() {
  await withFetch(async () => jsonResponse(200, BACKEND_CONFIG), async () => { await getShopConfig(); });
}

test('getShopConfig 优先读取后端配置', async () => {
  await withFetch(async () => jsonResponse(200, BACKEND_CONFIG), async () => {
    const config = await getShopConfig();
    assert.equal(config.store.name, 'API 店');
    assert.equal(config.demo, false);
  });
});

test('getShopConfig 网络失败或服务端 5xx 时抛错，不静默回退演示', async () => {
  await useBackendMode();
  await withFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
    await assert.rejects(() => getShopConfig(), TypeError);
  });
  await withFetch(async () => jsonResponse(500, {}), async () => {
    await assert.rejects(() => getShopConfig());
  });
  // 抛错时不能顺手置位静态回退：页面应走「重连」，而不是悄悄变成演示模式。
  assert.equal(isStaticHost(), false);
});

test('getShopConfig 对全量回退主机的 200 HTML 也判为静态托管', async () => {
  await useBackendMode();
  await withFetch(async () => ({
    ok: true, status: 200,
    headers: { get: name => (name === 'content-type' ? 'text/html; charset=utf-8' : null) },
    json: async () => { throw new Error('HTML 解析不成 JSON'); },
  }), async () => {
    const config = await getShopConfig();
    assert.equal(config.demo, true);
    assert.equal(isStaticHost(), true);
  });
});

test('静态托管标志在服务恢复后复位', async () => {
  await withFetch(async () => jsonResponse(404, {}), async () => { await getShopConfig(); });
  assert.equal(isStaticHost(), true);
  await withFetch(async () => jsonResponse(200, BACKEND_CONFIG), async () => {
    const config = await getShopConfig();
    assert.equal(config.demo, false);
  });
  assert.equal(isStaticHost(), false);
});

test('getShopConfig 在接口 404 时回退为本地演示配置', async () => {
  await withFetch(async () => jsonResponse(404, {}), async () => {
    const config = await getShopConfig();
    assert.equal(config.demo, true);
    assert.equal(config.store.name, 'Sunny Tea House');
    assert.ok(config.tags.length >= 6);
  });
});

test('配置读取失败后，生成不再请求接口，直接返回本地演示文案', async () => {
  await withFetch(async () => jsonResponse(404, {}), async () => { await getShopConfig(); });
  await withFetch(async () => {
    throw new Error('静态模式下不应再请求 /api/reviews');
  }, async () => {
    const result = await requestReview({ platform: 'Google', tags: ['服务好'], language: 'auto' });
    assert.equal(result.demo, true);
    assert.equal(result.language, 'en');
    assert.ok(result.content.includes('Sunny Tea House'));
  });
});

test('requestReview 对 405 返回本地演示文案', async () => {
  await useBackendMode();
  await withFetch(async () => jsonResponse(405, {}), async () => {
    const result = await requestReview({ platform: '小红书', tags: ['茶香浓郁'], language: 'auto' });
    assert.equal(result.demo, true);
    assert.equal(result.language, 'zh-CN');
  });
});

test('requestReview 网络失败时回退为本地演示文案', async () => {
  await useBackendMode();
  await withFetch(async () => { throw new TypeError('fetch failed'); }, async () => {
    const result = await requestReview({ platform: 'Google', tags: ['出餐快'], language: 'auto' });
    assert.equal(result.demo, true);
  });
});

test('requestReview 保留后端的密钥错误，不回退为演示', async () => {
  await useBackendMode();
  await withFetch(async () => jsonResponse(500, { error: '生成服务的密钥无效，请联系店家检查配置。' }), async () => {
    await assert.rejects(() => requestReview({ platform: 'Google', tags: ['服务好'], language: 'en' }), /keyError/);
  });
});

test('requestReview 保留后端的频率限制错误，不回退为演示', async () => {
  await useBackendMode();
  await withFetch(async () => jsonResponse(429, { error: '操作较频繁，请一分钟后再试。' }), async () => {
    await assert.rejects(() => requestReview({ platform: 'Google', tags: ['服务好'], language: 'en' }), /rateError/);
  });
});
