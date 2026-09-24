import test from 'node:test';
import assert from 'node:assert/strict';
import { createNetlifyHandler } from '../server/netlify-handler.js';
import { config as reviewRouting } from '../netlify/functions/reviews.mjs';
import { config as configRouting } from '../netlify/functions/shop-config.mjs';

const request = (body, method = 'POST') => new Request('https://example.netlify.app/api/reviews', {
  method, ...(method === 'POST' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
});
const input = { tags: ['服务好'], platform: 'Google', language: 'fr-CA' };

test('Netlify 路由和分布式限流配置对应前端接口', () => {
  assert.equal(reviewRouting.path, '/api/reviews');
  assert.equal(configRouting.path, '/api/config');
  assert.deepEqual(reviewRouting.rateLimit.aggregateBy, ['ip', 'domain']);
  assert.equal(reviewRouting.rateLimit.windowLimit, 10);
});

test('Netlify 公开配置不泄露 Key、机器人地址，且固定为真实模式', async () => {
  const handler = createNetlifyHandler('config', { getEnv: () => ({ DEEPSEEK_API_KEY: 'private-secret', WECHAT_WEBHOOK_URL: 'private-hook' }) });
  const response = await handler(new Request('https://example.netlify.app/api/config'));
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(!text.includes('private-'));
  assert.equal(JSON.parse(text).demo, false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('Netlify 真实模式把密钥发往 DeepSeek，返回所选语言', async () => {
  let count = 0;
  const handler = createNetlifyHandler('reviews', {
    getEnv: () => ({ DEMO_MODE: 'false', DEEPSEEK_API_KEY: 'test-key' }),
    fetchImpl: async (url, options) => {
      count++;
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.ok(options.signal instanceof AbortSignal);
      assert.match(JSON.parse(options.body).messages[0].content, /加拿大法语/);
      return Response.json({ choices: [{ message: { content: 'Le service était attentionné.' } }] });
    },
  });
  const response = await handler(request(input));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { content: 'Le service était attentionné.', platform: 'Google', language: 'fr-CA', demo: false });
  assert.equal(count, 1);
});

test('Netlify 拒绝错误方法、无效数据及超大请求体', async () => {
  const handler = createNetlifyHandler('reviews', { getEnv: () => ({}) });
  assert.equal((await handler(request(null, 'GET'))).status, 405);
  assert.equal((await handler(request({ ...input, language: 'invalid' }))).status, 400);
  assert.equal((await handler(request({ ...input, padding: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await handler(new Request('https://example.netlify.app/api/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }))).status, 400);
});

test('Netlify 密钥缺失和上游认证错误均不泄露服务细节', async () => {
  const missing = createNetlifyHandler('reviews', { getEnv: () => ({ DEMO_MODE: 'false' }) });
  assert.equal((await missing(request(input))).status, 500);
  const rejected = createNetlifyHandler('reviews', {
    getEnv: () => ({ DEMO_MODE: 'false', DEEPSEEK_API_KEY: 'test-secret' }),
    fetchImpl: async () => new Response('private upstream secret', { status: 401 }),
  });
  const response = await rejected(request(input));
  assert.equal(response.status, 502);
  const body = await response.text();
  assert.match(body, /密钥无效/);
  assert.ok(!body.includes('secret'));
});
