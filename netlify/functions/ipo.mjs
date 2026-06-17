import handler from '../../api/ipo.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
