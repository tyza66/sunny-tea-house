import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAGS, validateInput, generateReview, notifyWechat, ServiceError } from './reviews.js';

export function createApp(config, dependencies = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/config', (_req, res) => res.json({
    store: config.store, demo: config.demo, tags: TAGS, urls: config.urls,
    notificationEnabled: config.notify && !config.demo,
  }));
  app.post('/api/reviews', rateLimit({
    windowMs: 60000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: '操作较频繁，请一分钟后再试。' },
  }), async (req, res, next) => {
    try {
      const input = validateInput(req.body);
      const content = await generateReview(input, config, dependencies.fetchImpl);
      res.json({ content, platform: input.platform, language: input.language, demo: config.demo });
      // 主请求先响应。通知失败单独记录，不让顾客误以为评价生成失败。
      void notifyWechat(input, content, config, dependencies.fetchImpl).catch(() => {
        console.error('[通知失败] 请检查企业微信配置或服务可用性；评价初稿已正常返回。');
      });
    } catch (error) { next(error); }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use((error, _req, res, _next) => {
    const status = error instanceof ServiceError ? error.status : error.status === 413 ? 413 : error.type === 'entity.parse.failed' ? 400 : 500;
    res.status(status).json({ error: error instanceof ServiceError ? error.message : status === 413 ? '请求内容过大。' : status === 400 ? '请求格式不正确。' : '服务暂时异常，请稍后重试。' });
  });
  return app;
}
