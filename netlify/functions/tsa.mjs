import handler from '../../api/tsa.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
