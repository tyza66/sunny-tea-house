import { ERROR_KEYS } from '../shared/languages.js';

export async function getShopConfig() {
  const response = await fetch('/api/config', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('loadError');
  return response.json();
}

export async function requestReview(input) {
  const response = await fetch('/api/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal: AbortSignal.timeout(80000),
  });
  // Netlify 边缘限流或网关错误可能返回纯文本，不能直接假设为 JSON。
  const data = await response.json().catch(() => ({}));
  if (response.status === 429) throw new Error('rateError');
  if (!response.ok) throw new Error(ERROR_KEYS[data.error] || 'serverError');
  if (typeof data.content !== 'string' || !data.content.trim()) throw new Error('incompleteError');
  return data;
}
