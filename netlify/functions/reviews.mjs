import { createNetlifyHandler } from '../../server/netlify-handler.js';

export default createNetlifyHandler('reviews');
// 使用 Netlify 边缘限流，避免无服务器多实例导致内存限流失效。
export const config = {
  path: '/api/reviews',
  rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowSize: 60, windowLimit: 10 },
};
