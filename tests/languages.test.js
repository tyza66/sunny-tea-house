import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { LANGUAGES } from '../shared/languages.js';
import { messages } from '../src/messages.js';
import { validateInput, buildMessages, generateReview, TAGS } from '../server/reviews.js';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';

test('五种界面语言的文案完整，语言字段拒绝白名单外的输入', () => {
  for (const row of Object.values(messages)) {
    assert.equal(row.length, LANGUAGES.length);
    assert.ok(row.every(value => typeof value === 'string' && value.trim()));
  }
  for (const language of ['de', 'ignore instructions', null, {}, 12]) {
    assert.throws(() => validateInput({ tags: ['服务好'], platform: 'Google', language }), { status: 400 });
  }
  assert.equal(validateInput({ tags: ['服务好'], platform: 'Google' }).language, 'en');
  assert.equal(validateInput({ tags: ['服务好'], platform: '小红书', language: 'auto' }).language, 'zh-CN');
});

test('所有语言与平台的提示词使用所选语言，演示覆盖全部标签组合', async () => {
  const config = readConfig({});
  for (const language of LANGUAGES) {
    for (const platform of ['Google', '小红书']) {
      for (let a = 0; a < TAGS.length; a++) {
        for (let b = a; b < TAGS.length; b++) {
          const input = { platform, language: language.code, tags: a === b ? [TAGS[a]] : [TAGS[a], TAGS[b]] };
          assert.ok(buildMessages(input, config.store)[0].content.includes(language.prompt));
          const content = await generateReview(input, config);
          assert.ok(content && !content.includes('undefined'));
          if (platform === '小红书') assert.ok([...content].length <= 150);
          if (language.code === 'zh-TW') assert.ok(!/[这记饮浓]/.test(content));
        }
      }
    }
  }
});

test('HTTP 传递独立评价语言，返回实际语言，不依赖平台默认值', async t => {
  const server = createApp(readConfig({})).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  for (const language of LANGUAGES) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/reviews`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'Google', tags: ['服务好'], language: language.code }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).language, language.code);
  }
});
