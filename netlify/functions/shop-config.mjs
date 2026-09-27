// 维护者：https://github.com/tyza66
import { createNetlifyHandler } from '../../server/netlify-handler.js';

export default createNetlifyHandler('config');
export const config = { path: '/api/config' };
