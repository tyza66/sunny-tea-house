import 'dotenv/config';

// 通用 AI 服务商配置：任何 OpenAI 兼容（/chat/completions + Bearer 认证）的
// 接口都能用，默认值即 DeepSeek 官方。旧名 DEEPSEEK_API_KEY/DEEPSEEK_MODEL
// 作为别名继续可用，兼容已按旧文档配置的部署。
const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_AI_MODEL = 'deepseek-v4-flash';

// 本机或内网自建服务允许 HTTP 自测；公网地址必须 HTTPS，避免密钥明文过网。
function aiEndpoint(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return `${DEFAULT_AI_BASE_URL}/chat/completions`;
  let url;
  try { url = new URL(raw); } catch { throw new Error('AI_BASE_URL 必须是以 http(s) 开头的接口地址'); }
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('AI_BASE_URL 公网地址必须使用 HTTPS');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}/chat/completions`;
}

function platformUrl(value, allowedDomains, name) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || !allowedDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new Error(`${name} 必须是对应平台的 HTTPS 链接`);
  }
  return url.href;
}

export function readConfig(env = process.env) {
  const demo = env.DEMO_MODE !== 'false';
  // Netlify 控制台粘贴时偶尔会带引号或换行，统一清理后再交给上游。
  const rawApiKey = String(env.AI_API_KEY || env.DEEPSEEK_API_KEY || '').trim();
  const apiKey = rawApiKey.replace(/^(['"])(.*)\1$/s, '$2').trim();
  if (!demo && !apiKey) throw new Error('真实模式需要填写 AI_API_KEY');
  const endpoint = aiEndpoint(env.AI_BASE_URL);
  const notify = env.ENABLE_WECHAT_NOTIFY === 'true';
  const webhook = env.WECHAT_WEBHOOK_URL || '';
  if (notify) {
    const url = new URL(webhook);
    if (url.origin !== 'https://qyapi.weixin.qq.com' || url.pathname !== '/cgi-bin/webhook/send' || !url.searchParams.get('key')) {
      throw new Error('请配置有效的企业微信群机器人 Webhook 地址');
    }
  }
  const store = { name: env.STORE_NAME || '一茶一言', city: env.STORE_CITY || 'San Jose' };
  // Google 未配置商家链接时，默认跳到 Google 地图搜索该店（海外店页面入口）。
  const googleUrl = platformUrl(env.GOOGLE_REVIEW_URL, ['google.com', 'g.page', 'maps.app.goo.gl'], 'GOOGLE_REVIEW_URL')
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.city}`)}`;
  return {
    demo, notify, webhook,
    apiKey, endpoint,
    model: String(env.AI_MODEL || env.DEEPSEEK_MODEL || '').trim() || DEFAULT_AI_MODEL,
    store,
    urls: {
      Google: googleUrl,
      小红书: platformUrl(env.XIAOHONGSHU_URL || 'https://www.xiaohongshu.com/', ['xiaohongshu.com', 'xhslink.com'], 'XIAOHONGSHU_URL'),
    },
  };
}
