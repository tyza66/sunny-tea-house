import { resolveLanguage, ERROR_KEYS } from '../shared/languages.js';
import { TAGS, demoReview } from '../shared/review-demo.js';

const DEMO_STORE = { name: 'Sunny Tea House', city: 'San Jose' };
const DEMO_URLS = {
  Google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${DEMO_STORE.name} ${DEMO_STORE.city}`)}`,
  小红书: 'https://www.xiaohongshu.com/',
};

function demoConfig() {
  return { store: DEMO_STORE, demo: true, tags: TAGS, urls: DEMO_URLS, notificationEnabled: false };
}

function demoResult(input) {
  return {
    content: demoReview(input, DEMO_STORE),
    platform: input.platform,
    language: resolveLanguage(input.language, input.platform),
    demo: true,
  };
}

// 静态演示托管（如 GitHub Pages）没有 /api：接口 404 或网络不可达时
// 回退到本地示例文案，让演示闭环仍可跑通；真实后端可用时始终优先走后端。
export async function getShopConfig() {
  try {
    const response = await fetch('/api/config', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    return demoConfig();
  }
}

export async function requestReview(input) {
  let response;
  try {
    response = await fetch('/api/reviews', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(80000),
    });
  } catch (error) {
    // 仅网络层失败时降级；密钥失效等服务端业务的错误应原样展示。
    if (response === undefined && error instanceof TypeError) return demoResult(input);
    throw error;
  }
  // 静态托管通常对 /api/reviews 返回 404，此时切换到本地演示。
  if (response.status === 404) return demoResult(input);
  // Netlify 边缘限流或网关错误可能返回纯文本，不能直接假设为 JSON。
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) throw new Error('rateError');
  if (!response.ok) throw new Error(ERROR_KEYS[data.error] || 'serverError');
  if (typeof data.content !== 'string' || !data.content.trim()) throw new Error('incompleteError');
  return data;
}
