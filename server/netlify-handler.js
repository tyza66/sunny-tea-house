import { readConfig } from './config.js';
import { TAGS, validateInput, generateReview, notifyWechat, ServiceError } from './reviews.js';

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
}

export function createNetlifyHandler(kind, { getEnv = () => process.env, fetchImpl = fetch } = {}) {
  return async function handler(request, context = {}) {
    const method = kind === 'config' ? 'GET' : 'POST';
    if (request.method !== method) return json({ error: '请求方法不支持。' }, 405, { Allow: method });
    try {
      // 密钥在每次函数调用时从 Netlify 运行时环境读取，绝不传给前端。
      // 演示开关在 Netlify 上固定关闭：部署站点始终调用真实 DeepSeek，避免发布演示内容。
      const settings = readConfig(getEnv());
      settings.demo = false;
      if (kind === 'config') return json({
        store: settings.store, demo: settings.demo, tags: TAGS, urls: settings.urls,
        notificationEnabled: settings.notify && !settings.demo,
      });
      if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
        return json({ error: '请求格式不正确。' }, 400);
      }
      const text = await request.text();
      if (Buffer.byteLength(text) > 8192) return json({ error: '请求内容过大。' }, 413);
      let body;
      try { body = JSON.parse(text); } catch { return json({ error: '请求格式不正确。' }, 400); }
      const input = validateInput(body);
      // 同步函数最长运行 60 秒；两次模型请求共用 45 秒预算，留出响应时间。
      const generationDeadline = AbortSignal.timeout(45000);
      const boundedFetch = (url, options) => fetchImpl(url, {
        ...options, signal: AbortSignal.any([generationDeadline, ...(options.signal ? [options.signal] : [])]),
      });
      const content = await generateReview(input, settings, boundedFetch);
      if (settings.notify && !settings.demo && typeof context.waitUntil === 'function') {
        // 先返回顾客初稿，通知在同一次函数的剩余时间内完成；不承诺可靠送达。
        context.waitUntil(notifyWechat(input, content, settings, boundedFetch).catch(() => {
          console.error('[通知失败] 初稿已返回，请检查企业微信配置或生成服务。');
        }));
      }
      return json({ content, platform: input.platform, language: input.language, demo: settings.demo });
    } catch (error) {
      // 仅返回经过控制的中文错误，由界面映射为当前语言；不暴露环境变量或上游原文。
      if (error instanceof ServiceError) return json({ error: error.message }, error.status);
      return json({ error: '生成服务暂不可用，请稍后重试。' }, 500);
    }
  };
}
