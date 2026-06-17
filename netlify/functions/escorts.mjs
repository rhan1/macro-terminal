import handler from '../../api/escorts.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
