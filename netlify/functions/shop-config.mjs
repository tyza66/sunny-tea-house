import { createNetlifyHandler } from '../../server/netlify-handler.js';

export default createNetlifyHandler('config');
export const config = { path: '/api/config' };
