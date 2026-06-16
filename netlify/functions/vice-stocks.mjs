import handler from '../../api/vice-stocks.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
