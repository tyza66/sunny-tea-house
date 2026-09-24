import test from 'node:test';
import assert from 'node:assert/strict';
import { demoReview, TAGS } from '../shared/review-demo.js';
import { LANGUAGES } from '../shared/languages.js';

const STORE = { name: 'Sunny Tea House', city: '多伦多' };
const PLATFORMS = ['Google', '小红书'];

// 只统计字母与数字，标点和 emoji 不计入正文长度，专门抓“片段缺失把文案掏空”的缺陷。
const bodyLength = text => [...text].filter(char => /[\p{Letter}\p{Number}]/u.test(char)).length;
const sample = language => demoReview({ platform: 'Google', tags: TAGS.slice(0, 2), language }, STORE);

test('每种语言与平台组合都输出完整可读的演示文案', () => {
  for (const { code } of LANGUAGES) {
    for (const platform of PLATFORMS) {
      const review = demoReview({ platform, tags: TAGS.slice(0, 2), language: code }, STORE);
      const context = `${code}/${platform}`;
      assert.ok(bodyLength(review) >= 30, `${context} 正文过短: ${review}`);
      assert.ok(review.includes(STORE.name), `${context} 缺少店名: ${review}`);
      assert.ok(!/，，|。。|\.\./.test(review), `${context} 标点连排: ${review}`);
    }
  }
});

test('非简体中文语言不会回落到简体中文文案', () => {
  const simplified = sample('zh-CN');
  for (const { code } of LANGUAGES) {
    if (code === 'zh-CN') continue;
    assert.notEqual(sample(code), simplified, `${code} 回落为简体中文`);
  }
});

test('平台腔调区分明显，且小红书文案不会过长', () => {
  for (const { code } of LANGUAGES) {
    const google = demoReview({ platform: 'Google', tags: ['出餐快'], language: code }, STORE);
    const rednote = demoReview({ platform: '小红书', tags: ['出餐快'], language: code }, STORE);
    assert.notEqual(google, rednote, `${code} 两个平台文案雷同`);
    assert.ok([...rednote].length <= 200, `${code} 小红书文案过长`);
  }
});

test('标签或语言片段缺失时直接报错', () => {
  assert.throws(() => demoReview({ platform: 'Google', tags: ['伪造标签'], language: 'zh-CN' }, STORE), /缺少语言片段/);
  assert.throws(() => demoReview({ platform: 'Google', tags: ['服务好'], language: 'ja' }, STORE), /缺少语言片段/);
  assert.throws(() => demoReview({ platform: '其他', tags: ['服务好'], language: 'zh-CN' }, STORE));
});
