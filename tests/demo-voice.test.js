// 维护者：https://github.com/tyza66
import test from 'node:test';
import assert from 'node:assert/strict';
import { demoReview, DEMO_VARIANTS, TAGS } from '../shared/review-demo.js';
import { LANGUAGES } from '../shared/languages.js';

const STORE = { name: 'Sunny Tea House', city: '多伦多' };
const PLATFORMS = ['Google', '小红书'];
const VARIANTS = [...Array(DEMO_VARIANTS).keys()];

// 只统计字母与数字，标点和 emoji 不计入正文长度，专门抓“片段缺失把文案掏空”的缺陷。
const bodyLength = text => [...text].filter(char => /[\p{Letter}\p{Number}]/u.test(char)).length;
const sample = (language, variant) => demoReview({ platform: 'Google', tags: TAGS.slice(0, 2), language }, STORE, variant);

const GOOGLE_JUDGEMENT = {
  'zh-CN': /^(值得|会想再来|整体表现不错)/,
  'zh-TW': /^(值得|會想再來|整體表現不錯)/,
  en: /^(Good|Easy to recommend|Solid)/,
  'fr-CA': /^(Bonne adresse|À recommander|Une halte thé solide)/,
  es: /^(Buen sitio|Recomendable|Una parada de té sólida)/,
};

const GOOGLE_NARRATION = {
  'zh-CN': /坐了一会|歇了一会脚|今天在/,
  'zh-TW': /坐了一會|歇了一會腳|今天在/,
  en: /^(Stopped in|Swing by|Tried )/,
  'fr-CA': /^(Passage chez|Arrêt chez|Essayé)/,
  es: /^(Pasé por|Me pasé por|Probé)/,
};

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

test('Google 演示文案先给判断，不写成到店流水账', () => {
  for (const { code } of LANGUAGES) {
    for (const variant of VARIANTS) {
      const review = sample(code, variant);
      const context = `${code}/Google/#${variant}`;
      assert.match(review, GOOGLE_JUDGEMENT[code], `${context} 未先给整体判断: ${review}`);
      assert.doesNotMatch(review, GOOGLE_NARRATION[code], `${context} 仍是到店流水账: ${review}`);
    }
  }
});

test('小红书演示文案以 2–4 个话题标签结尾', () => {
  for (const { code } of LANGUAGES) {
    for (const variant of VARIANTS) {
      const review = demoReview({ platform: '小红书', tags: TAGS.slice(0, 2), language: code }, STORE, variant);
      const tagLine = review.split('\n').filter(Boolean).at(-1);
      const tags = tagLine.split(/\s+/).filter(tag => tag.startsWith('#'));
      const context = `${code}/小红书/#${variant}`;
      assert.match(tagLine, /^#\S+(?: #\S+)+$/, `${context} 缺少独立话题标签行: ${review}`);
      assert.ok(tags.length >= 2 && tags.length <= 4, `${context} 话题标签数量应为 2–4 个: ${review}`);
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
