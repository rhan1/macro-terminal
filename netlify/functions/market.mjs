import handler from '../../api/market.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
