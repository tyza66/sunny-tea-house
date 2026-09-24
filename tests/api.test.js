import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { validateInput, buildMessages, generateReview, callDeepSeek, notifyWechat } from '../server/reviews.js';

const config = readConfig({});
test('拒绝非法平台、空标签、重复标签和超额标签', () => {
  for (const input of [null, {}, { platform: '其他', tags: ['服务好'] }, { platform: 'Google', tags: [] },
    { platform: 'Google', tags: ['服务好', '服务好'] }, { platform: 'Google', tags: ['服务好', '出餐快', '环境干净'] },
    { platform: 'Google', tags: ['伪造标签'] }]) assert.throws(() => validateInput(input), { status: 400 });
});
test('两种平台演示内容与所选标签对应，小红书不超过 150 字符', async () => {
  const english = await generateReview({ platform: 'Google', tags: ['服务好', '出餐快'] }, config);
  assert.match(english, /friendly/); assert.match(english, /quickly/);
  const chinese = await generateReview({ platform: '小红书', tags: ['茶香浓郁'] }, config);
  assert.match(chinese, /茶香浓郁/); assert.ok([...chinese].length <= 150);
  assert.match(buildMessages({ platform: '小红书', tags: ['服务好'] }, config.store)[0].content, /不虚构/);
});
test('真实模式缺少密钥或平台链接不合法时拒绝启动', () => {
  assert.throws(() => readConfig({ DEMO_MODE: 'false' }), /DEEPSEEK_API_KEY/);
  assert.throws(() => readConfig({ GOOGLE_REVIEW_URL: 'https://evilgoogle.com' }), /HTTPS/);
  assert.throws(() => readConfig({ GOOGLE_REVIEW_URL: 'javascript:alert(1)' }), /HTTPS/);
  assert.throws(() => readConfig({ ENABLE_WECHAT_NOTIFY: 'true', WECHAT_WEBHOOK_URL: 'https://example.com' }));
});
test('DeepSeek 官方地址、服务端认证和正常响应', async () => {
  const output = await callDeepSeek([], { ...config, apiKey: 'test-secret' }, async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    const body = JSON.parse(options.body);
    assert.equal(body.max_tokens, 800);
    assert.deepEqual(body.thinking, { type: 'disabled' });
    return Response.json({ choices: [{ message: { content: ' 正常初稿 ' } }] });
  });
  assert.equal(output, '正常初稿');
});
test('上游认证、限流、空响应和网络错误显示可理解提示', async () => {
  for (const status of [401, 402, 429, 500]) {
    await assert.rejects(callDeepSeek([], config, async () => new Response('secret upstream details', { status })), error => {
      assert.ok(!error.message.includes('secret')); return true;
    });
  }
  await assert.rejects(callDeepSeek([], config, async () => Response.json({})), /未收到有效/);
  await assert.rejects(callDeepSeek([], config, async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '未完成' } }] })), /未完整结束/);
  await assert.rejects(callDeepSeek([], config, async () => { throw new Error('network'); }), /无法连接/);
});
test('小红书超限只重试一次，再超限明确失败', async () => {
  let calls = 0;
  await assert.rejects(generateReview({ platform: '小红书', tags: ['服务好'] }, { ...config, demo: false }, async () => {
    calls++; return Response.json({ choices: [{ message: { content: '茶'.repeat(151) } }] });
  }), /字数限制/);
  assert.equal(calls, 2);
});
test('企业微信默认不发送，启用时生成摘要并发送标记为初稿的消息', async () => {
  const input = { platform: 'Google', tags: ['服务好'] };
  await notifyWechat(input, 'review', config, () => { throw new Error('不应调用'); });
  const calls = [];
  await notifyWechat(input, 'review', { ...config, demo: false, notify: true, webhook: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test' }, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return calls.length === 1 ? Response.json({ choices: [{ message: { content: '摘要：服务友好。回复草稿：感谢分享。' } }] }) : Response.json({ errcode: 0 });
  });
  assert.equal(calls.length, 2); assert.match(calls[1].body.text.content, /尚未发布/);
  assert.ok(Buffer.byteLength(calls[1].body.text.content) <= 2048);
});
test('HTTP 集成：公开配置无密钥、生成成功、非法输入与请求频率限制', async t => {
  const server = createApp({ ...config, apiKey: 'private-key', webhook: 'private-hook' }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const publicConfig = await (await fetch(`${base}/api/config`)).text();
  assert.ok(!publicConfig.includes('private-'));
  const request = body => fetch(`${base}/api/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await request({})).status, 400);
  const result = await request({ platform: 'Google', tags: ['服务好'] });
  assert.equal(result.status, 200); assert.match((await result.json()).content, /friendly/);
  for (let i = 0; i < 8; i++) await request({ platform: 'Google', tags: ['服务好'] });
  assert.equal((await request({ platform: 'Google', tags: ['服务好'] })).status, 429);
});
