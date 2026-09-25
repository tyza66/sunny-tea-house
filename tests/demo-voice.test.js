import test from 'node:test';
import assert from 'node:assert/strict';
import { demoReview, DEMO_VARIANTS, TAGS } from '../shared/review-demo.js';
import { LANGUAGES } from '../shared/languages.js';

const STORE = { name: '一茶一言', city: '多伦多' };
const PLATFORMS = ['Google', '小红书'];
const VARIANTS = [...Array(DEMO_VARIANTS).keys()];

// 只统计字母与数字，标点和 emoji 不计入正文长度，专门抓“片段缺失把文案掏空”的缺陷。
const bodyLength = text => [...text].filter(char => /[\p{Letter}\p{Number}]/u.test(char)).length;
const sample = (language, variant) => demoReview({ platform: 'Google', tags: TAGS.slice(0, 2), language }, STORE, variant);

test('每种语言、平台与轮换说法都输出完整可读的演示文案', () => {
  for (const { code } of LANGUAGES) {
    for (const platform of PLATFORMS) {
      const texts = [];
      for (const variant of VARIANTS) {
        const review = demoReview({ platform, tags: TAGS.slice(0, 2), language: code }, STORE, variant);
        texts.push(review);
        const context = `${code}/${platform}/#${variant}`;
        assert.ok(bodyLength(review) >= 30, `${context} 正文过短: ${review}`);
        assert.ok(review.includes(STORE.name), `${context} 缺少店名: ${review}`);
        assert.ok(!/，，|。。|\.\./.test(review), `${context} 标点连排: ${review}`);
        assert.ok(!/\$\{/.test(review), `${context} 占位符未替换: ${review}`);
      }
      // 标题句可以只说店名，但每个组合至少有一种说法带出城市。
      assert.ok(texts.some(text => text.includes(STORE.city)), `${code}/${platform} 没有任何说法提到城市`);
    }
  }
});

test('非简体中文语言不会回落到简体中文文案', () => {
  for (const { code } of LANGUAGES) {
    if (code === 'zh-CN') continue;
    for (const variant of VARIANTS) {
      assert.notEqual(sample(code, variant), sample('zh-CN', variant), `${code}/#${variant} 回落为简体中文`);
    }
  }
});

test('平台腔调区分明显，且小红书文案不会过长', () => {
  for (const { code } of LANGUAGES) {
    for (const variant of VARIANTS) {
      const google = demoReview({ platform: 'Google', tags: ['出餐快'], language: code }, STORE, variant);
      const rednote = demoReview({ platform: '小红书', tags: ['出餐快'], language: code }, STORE, variant);
      assert.notEqual(google, rednote, `${code}/#${variant} 两个平台文案雷同`);
      assert.ok([...rednote].length <= 150, `${code}/#${variant} 小红书文案超过 150 字符: ${[...rednote].length}`);
    }
  }
});

test('同一组选择重复生成会轮换说法', () => {
  const input = { platform: 'Google', tags: ['服务好'], language: 'zh-CN' };
  assert.equal(new Set(VARIANTS.map(variant => demoReview(input, STORE, variant))).size, DEMO_VARIANTS, '轮换说法数量不足');
  // 不显式传 variant 时自动轮换：连点两次重新生成不会得到同一段文案。
  assert.notEqual(demoReview(input, STORE), demoReview(input, STORE));
});

test('标签或语言片段缺失时直接报错', () => {
  assert.throws(() => demoReview({ platform: 'Google', tags: ['伪造标签'], language: 'zh-CN' }, STORE), /缺少语言片段/);
  assert.throws(() => demoReview({ platform: 'Google', tags: ['服务好'], language: 'ja' }, STORE), /缺少语言片段/);
  assert.throws(() => demoReview({ platform: '其他', tags: ['服务好'], language: 'zh-CN' }, STORE));
});
