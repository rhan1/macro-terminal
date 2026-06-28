import handler from '../../api/stress-signals.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
