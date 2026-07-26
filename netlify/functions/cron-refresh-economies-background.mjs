import handler from '../../api/cron/refresh-economies.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler, { cronSecret: true });
export const config = { schedule: "17 9 * * 1" };
