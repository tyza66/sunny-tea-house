import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKey, setBrowserKey, clearBrowserKey, hasBrowserKey, sessionUsage,
  configureBrowserAI, generateWithBrowserKey, BROWSER_ERROR_KEYS } from '../src/browser-ai.js';
import { buildMessages } from '../shared/prompt.js';
import { getShopConfig, requestReview, isStaticHost } from '../src/api.js';

const STORE = { name: 'Sunny Tea House', city: 'San Jose' };

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
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

// 先让页面进入静态托管状态，再执行生成；结束后清理密钥避免影响其他测试。
async function useStaticMode(fetchImpl) {
  await withFetch(async () => jsonResponse(404, {}), async () => { await getShopConfig(); });
  assert.equal(isStaticHost(), true);
}

test('normalizeKey 通用校验：不绑定服务商格式，只拦明显没粘完整的', () => {
  assert.equal(normalizeKey(' sk-0123456789abcdefghij '), 'sk-0123456789abcdefghij');
  assert.equal(normalizeKey('"sk-0123456789abcdefghij"'), 'sk-0123456789abcdefghij');
  assert.equal(normalizeKey("'pk-0123456789abcdefghij'"), 'pk-0123456789abcdefghij');
  assert.equal(normalizeKey('pk-0123456789abcdefghij'), 'pk-0123456789abcdefghij');
  assert.equal(normalizeKey('sk-short'), '');
  assert.equal(normalizeKey('sk-0123 456789abcdefghij'), '');
  assert.equal(normalizeKey('sk-0123456789abcdef\nghij'), '');
  assert.equal(normalizeKey(''), '');
  assert.equal(normalizeKey(null), '');
  assert.equal(normalizeKey(undefined), '');
});

test('未启用密钥时拒绝生成；启用后可清除并重新启用', () => {
  clearBrowserKey();
  assert.equal(hasBrowserKey(), false);
  assert.equal(setBrowserKey('bad'), false);
  assert.equal(hasBrowserKey(), false);
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  assert.equal(hasBrowserKey(), true);
  clearBrowserKey();
  assert.equal(hasBrowserKey(), false);
});

test('请求直连 DeepSeek 官方接口，载荷与服务端提示词、参数一致', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return jsonResponse(200, { choices: [{ message: { content: ' Nice draft ' } }] });
  }, async () => {
    const result = await requestReview({ platform: 'Google', tags: ['服务好'], language: 'auto' });
    assert.equal(result.demo, false);
    assert.equal(result.content, 'Nice draft');
    assert.equal(result.language, 'en');
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer sk-0123456789abcdefghij');
  assert.equal(calls[0].body.model, 'deepseek-v4-flash');
  assert.equal(calls[0].body.max_tokens, 800);
  assert.deepEqual(calls[0].body.thinking, { type: 'disabled' });
  assert.deepEqual(calls[0].body.messages, buildMessages({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE));
  assert.ok(!String(calls[0].url).includes('sk-'));
  clearBrowserKey();
});

test('会话计数累计，用于提示评审者额度消耗', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  assert.equal(sessionUsage(), 0);
  await withFetch(async () => jsonResponse(200, { choices: [{ message: { content: '草稿一' } }] }), async () => {
    await generateWithBrowserKey({ platform: '小红书', tags: ['服务好'], language: 'zh-CN' }, STORE);
    await generateWithBrowserKey({ platform: '小红书', tags: ['服务好'], language: 'zh-CN' }, STORE);
  });
  assert.equal(sessionUsage(), 2);
  clearBrowserKey();
});

test('401 提示密钥无效并标记清除；402 保留密钥提示余额不足', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  await withFetch(async () => jsonResponse(401, { error: 'invalid' }), async () => {
    await assert.rejects(() => generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE), error => {
    assert.equal(error.message, 'browserKeyError');
      assert.equal(error.clearKey, true);
      return true;
    });
  });
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  await withFetch(async () => jsonResponse(402, { error: 'balance' }), async () => {
    await assert.rejects(() => generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE), error => {
      assert.equal(error.message, 'browserBalanceError');
      assert.equal(error.clearKey, undefined);
      return true;
    });
  });
  assert.equal(hasBrowserKey(), true);
  clearBrowserKey();
});

test('模型不支持时自动降级 deepseek-chat 一次，两种模型都不可用时明确提示', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  const models = [];
  await withFetch(async (url, options) => {
    const body = JSON.parse(options.body);
    models.push(body.model);
    if (body.model === 'deepseek-v4-flash') return jsonResponse(400, { error: 'model not supported' });
    return jsonResponse(200, { choices: [{ message: { content: '降级后的初稿' } }] });
  }, async () => {
    const result = await generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE);
    assert.equal(result.content, '降级后的初稿');
  });
  assert.deepEqual(models, ['deepseek-v4-flash', 'deepseek-chat']);
  await withFetch(async (url, options) => {
    if (JSON.parse(options.body).model === 'deepseek-chat') return jsonResponse(200, { choices: [{ message: { content: '正常' } }] });
    return jsonResponse(400, { error: 'model not supported' });
  }, async () => {
    const result = await generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE);
    assert.equal(result.content, '正常');
  });
  clearBrowserKey();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  await withFetch(async () => jsonResponse(400, { error: 'model not supported' }), async () => {
    await assert.rejects(() => generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE), error => {
      assert.equal(error.message, 'browserModelError');
      return true;
    });
  });
  clearBrowserKey();
});

test('429、网络错误、超时、空响应与截断内容映射为稳定文案键', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  const cases = [
    [() => jsonResponse(429, { error: 'busy' }), 'rateError'],
    [() => { throw new TypeError('failed'); }, 'networkError'],
    [() => { const error = new Error('aborted'); error.name = 'TimeoutError'; throw error; }, 'timeout'],
    [() => jsonResponse(200, { choices: [{ message: { content: '   ' } }] }), 'incompleteError'],
    [() => jsonResponse(200, { choices: [{ finish_reason: 'length', message: { content: '半截' } }] }), 'incompleteError'],
  ];
  for (const [impl, code] of cases) {
    await withFetch(async () => impl(), async () => {
      await assert.rejects(() => generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE), error => {
        assert.equal(error.message, code);
        assert.ok(BROWSER_ERROR_KEYS.has(error.message));
        return true;
      });
    });
  }
  clearBrowserKey();
});

test('小红书超过 150 字符时只重试一次，仍超限则明确失败', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('sk-0123456789abcdefghij'), true);
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return jsonResponse(200, { choices: [{ message: { content: '茶'.repeat(151) } }] });
  }, async () => {
    await assert.rejects(() => generateWithBrowserKey({ platform: '小红书', tags: ['服务好'], language: 'zh-CN' }, STORE), /lengthError/);
  });
  assert.equal(calls, 2);
  calls = 0;
  await withFetch(async () => {
    calls += 1;
    return jsonResponse(200, { choices: [{ message: { content: calls === 1 ? '茶'.repeat(151) : '压缩后的文案 🍵' } }] });
  }, async () => {
    const result = await generateWithBrowserKey({ platform: '小红书', tags: ['服务好'], language: 'zh-CN' }, STORE);
    assert.equal(result.content, '压缩后的文案 🍵');
  });
  assert.equal(calls, 2);
  clearBrowserKey();
});

test('未启用密钥时 requestReview 仍回退本地演示文案', async () => {
  await useStaticMode();
  clearBrowserKey();
  await withFetch(async () => { throw new Error('静态模式且无密钥时不应请求网络'); }, async () => {
    const result = await requestReview({ platform: 'Google', tags: ['服务好'], language: 'auto' });
    assert.equal(result.demo, true);
  });
});

test('自定义服务商：按面板里的接口地址与模型名请求，且不降级到 DeepSeek 备用模型', async () => {
  await useStaticMode();
  assert.equal(setBrowserKey('pk-0123456789abcdefghij'), true);
  configureBrowserAI({ baseUrl: 'https://models.example.org/v1', model: 'my-model' });
  const calls = [];
  await withFetch(async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return jsonResponse(400, { error: 'model not supported' });
  }, async () => {
    // 自定义模型不通时按服务商自身报错，不该偷偷改打 DeepSeek。
    await assert.rejects(() => generateWithBrowserKey({ platform: 'Google', tags: ['服务好'], language: 'en' }, STORE), error => {
      assert.equal(error.message, 'browserModelError');
      return true;
    });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://models.example.org/v1/chat/completions');
  assert.equal(calls[0].body.model, 'my-model');
  assert.equal(calls[0].body.thinking, undefined);
  assert.equal(calls[0].body.max_tokens, 800);
  // 复位默认地址与模型，避免影响同文件其余用例。
  configureBrowserAI({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' });
  clearBrowserKey();
});
