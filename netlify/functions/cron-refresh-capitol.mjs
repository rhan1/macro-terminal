import handler from '../../api/cron/refresh-capitol.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler, { cronSecret: true });
export const config = { schedule: '0 12 * * 1-5' };
