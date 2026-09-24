import 'dotenv/config';

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
  const rawApiKey = String(env.DEEPSEEK_API_KEY || '').trim();
  const apiKey = rawApiKey.replace(/^(['"])(.*)\1$/s, '$2').trim();
  if (!demo && !apiKey) throw new Error('真实模式需要填写 DEEPSEEK_API_KEY');
  const notify = env.ENABLE_WECHAT_NOTIFY === 'true';
  const webhook = env.WECHAT_WEBHOOK_URL || '';
  if (notify) {
    const url = new URL(webhook);
    if (url.origin !== 'https://qyapi.weixin.qq.com' || url.pathname !== '/cgi-bin/webhook/send' || !url.searchParams.get('key')) {
      throw new Error('请配置有效的企业微信群机器人 Webhook 地址');
    }
  }
  const store = { name: env.STORE_NAME || 'Sunny Tea House', city: env.STORE_CITY || 'San Jose' };
  // Google 未配置商家链接时，默认跳到 Google 地图搜索该店（海外店页面入口）。
  const googleUrl = platformUrl(env.GOOGLE_REVIEW_URL, ['google.com', 'g.page', 'maps.app.goo.gl'], 'GOOGLE_REVIEW_URL')
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${store.name} ${store.city}`)}`;
  return {
    demo, notify, webhook,
    apiKey, model: String(env.DEEPSEEK_MODEL || 'deepseek-v4-flash').trim() || 'deepseek-v4-flash',
    store,
    urls: {
      Google: googleUrl,
      小红书: platformUrl(env.XIAOHONGSHU_URL || 'https://www.xiaohongshu.com/', ['xiaohongshu.com', 'xhslink.com'], 'XIAOHONGSHU_URL'),
    },
  };
}
