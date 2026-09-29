// 维护者：https://github.com/tyza66
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

test('两个平台的提示词遵循真实发布习惯', () => {
  const config = readConfig({});
  const google = buildMessages({ platform: 'Google', tags: ['服务好'], language: 'en' }, config.store)[0].content;
  assert.match(google, /第一句先给整体判断/);
  assert.match(google, /不要写成探店日记或流水账/);
  assert.match(google, /真实的 Google 评价短而直接/);

  const rednote = buildMessages({ platform: '小红书', tags: ['茶香浓郁'], language: 'zh-CN' }, config.store)[0].content;
  assert.match(rednote, /含标点、空格、Emoji 与话题标签/);
  assert.match(rednote, /结尾另起一行放 2–4 个/);
  assert.match(rednote, /#探店 #奶茶 #下午茶/);
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
