import handler from '../../api/kalshi.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
