import handler from '../../api/cron/refresh-layoffs.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler, { cronSecret: true });
export const config = { schedule: '0 14 * * 1-5' };
