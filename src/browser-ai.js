// 静态托管（GitHub Pages 等）没有服务端时，评审者可粘贴自己的 DeepSeek 密钥，
// 由浏览器直连官方接口完成真实生成。密钥只保存在当前页面内存中：
// 不写入 localStorage / cookie / URL，刷新即失效；请求不经过本站任何服务器。
import { buildMessages } from '../shared/prompt.js';
import { resolveLanguage } from '../shared/languages.js';

const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';
// 部分早期账号只开放 deepseek-chat；官方返回模型不支持时自动降级一次。
const FALLBACK_MODEL = 'deepseek-chat';

// 浏览器端可抛出的稳定文案键；页面据此切换到当前语言，不回退到演示文案。
export const BROWSER_ERROR_KEYS = new Set(['browserKeyError', 'browserBalanceError', 'browserModelError',
  'timeout', 'networkError', 'rateError', 'lengthError', 'incompleteError', 'serverError']);

let apiKey = '';
let activeModel = MODEL;
let sessionCount = 0;

export function normalizeKey(raw) {
  const key = String(raw ?? '').replace(/^(['"])(.*)\1$/s, '$2').trim();
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(key) ? key : '';
}

export function setBrowserKey(raw) {
  const key = normalizeKey(raw);
  if (!key) return false;
  apiKey = key;
  activeModel = MODEL;
  sessionCount = 0;
  return true;
}

export function clearBrowserKey() { apiKey = ''; }
export function hasBrowserKey() { return apiKey.length > 0; }
export function sessionUsage() { return sessionCount; }

function fail(code, options = {}) {
  const error = new Error(code);
  // 密钥明确无效时让页面移除密钥并重新弹出填写面板。
  if (options.clearKey) error.clearKey = true;
  return error;
}

async function callDeepSeek(messages, fetchImpl, model = activeModel) {
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST', signal: AbortSignal.timeout(35000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 800,
        stream: false,
        // v4 系列默认可能进入内部推理，占用输出额度；短评价直接关闭。
        thinking: { type: 'disabled' },
      }),
    });
  } catch (error) {
    throw fail(error?.name === 'TimeoutError' ? 'timeout' : 'networkError');
  }
  if (!response.ok) {
    const detail = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
    if (response.status === 401) throw fail('browserKeyError', { clearKey: true });
    if (response.status === 402) throw fail('browserBalanceError');
    if (response.status === 429) throw fail('rateError');
    if (response.status === 400 && model === MODEL && /model/i.test(detail)) {
      activeModel = FALLBACK_MODEL;
      return callDeepSeek(messages, fetchImpl, FALLBACK_MODEL);
    }
    if (response.status === 400) throw fail('browserModelError');
    throw fail('serverError');
  }
  let data;
  try { data = await response.json(); } catch { throw fail('incompleteError'); }
  if (data?.choices?.[0]?.finish_reason === 'length') throw fail('incompleteError');
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw fail('incompleteError');
  return content.trim();
}

export async function generateWithBrowserKey(input, store, fetchImpl = fetch) {
  if (!apiKey) throw fail('browserKeyError');
  const messages = buildMessages(input, store);
  let content = await callDeepSeek(messages, fetchImpl);
  if (input.platform === '小红书' && [...content].length > 150) {
    content = await callDeepSeek([...messages, { role: 'assistant', content },
      { role: 'user', content: '请保持事实不变，将上文压缩至 150 字以内，包含标点、空白和 Emoji。' }], fetchImpl);
    if ([...content].length > 150) throw fail('lengthError');
  }
  sessionCount += 1;
  // 与服务端一致：返回解析后的实际语言，避免页面把 auto 当成语言名展示。
  return { content, platform: input.platform, language: resolveLanguage(input.language, input.platform), demo: false };
}
