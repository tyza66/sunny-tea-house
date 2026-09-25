import { resolveLanguage, ERROR_KEYS } from '../shared/languages.js';
import { TAGS, demoReview } from '../shared/review-demo.js';
import { generateWithBrowserKey, hasBrowserKey } from './browser-ai.js';

const DEMO_STORE = { name: 'Sunny Tea House', city: 'San Jose' };
// 静态主机（GitHub Pages 等）对 GET 缺失路径返回 404，对 POST 缺失路径常返回 405。
const NO_API_STATUS = new Set([404, 405]);
// /api/config 读取失败说明当前是纯静态托管，生成直接用本地文案，不再重复探测。
let staticFallback = false;
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

// 「确定没有服务端」的两种信号：静态主机对缺失接口按请求方法返回 404/405；
// 个别全量回退主机对任何路径都返回 200 的 HTML 单页，也同样视为没有接口。
function isStaticResponse(response) {
  if (NO_API_STATUS.has(response.status)) return true;
  if (response.status === 200) return (response.headers?.get?.('content-type') || '').includes('text/html');
  return false;
}

// 静态演示托管（如 GitHub Pages）没有 /api：接口 404/405 时回退到本地示例文案，
// 让演示闭环仍可跑通，并提供自带密钥入口；真实后端可用时始终优先走后端。
// 网络层失败（服务未启动、超时、断网）无法与静态托管区分，不猜：向上抛，
// 由页面展示「暂时无法加载店铺信息」与重连按钮，重试遇到静态托管再回退演示。
export async function getShopConfig() {
  let response;
  try {
    response = await fetch('/api/config', { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new TypeError('loadError');
  }
  if (isStaticResponse(response)) {
    staticFallback = true;
    return demoConfig();
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const config = await response.json();
  staticFallback = false;
  return config;
}

// 当前是否为无服务端的静态托管：只有静态托管才提供“自带密钥”入口。
export function isStaticHost() { return staticFallback; }

export async function requestReview(input) {
  // 静态托管且已启用自带密钥时，浏览器直连 DeepSeek 完成真实生成，不再用示例文案。
  if (staticFallback && hasBrowserKey()) return generateWithBrowserKey(input, DEMO_STORE);
  if (staticFallback) return demoResult(input);
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
  // 静态托管按请求方法不同返回 404 或 405，两种都说明当前没有接口。
  if (NO_API_STATUS.has(response.status)) return demoResult(input);
  // Netlify 边缘限流或网关错误可能返回纯文本，不能直接假设为 JSON。
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) throw new Error('rateError');
  if (!response.ok) throw new Error(ERROR_KEYS[data.error] || 'serverError');
  if (typeof data.content !== 'string' || !data.content.trim()) throw new Error('incompleteError');
  return data;
}
