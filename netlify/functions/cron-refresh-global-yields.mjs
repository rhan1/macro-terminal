import handler from '../../api/cron/refresh-global-yields.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler, { cronSecret: true });
export const config = { schedule: '30 21 * * 1-5' };
