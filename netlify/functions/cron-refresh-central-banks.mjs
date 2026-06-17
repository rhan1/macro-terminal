import handler from '../../api/cron/refresh-central-banks.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler, { cronSecret: true });
export const config = { schedule: '0 12 1 * *' };
