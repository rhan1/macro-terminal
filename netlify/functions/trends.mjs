import handler from '../../api/trends.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
