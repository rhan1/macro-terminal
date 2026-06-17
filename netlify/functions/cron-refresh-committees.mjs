import handler from '../../api/cron/refresh-committees.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler, { cronSecret: true });
export const config = { schedule: '0 8 1 * *' };
