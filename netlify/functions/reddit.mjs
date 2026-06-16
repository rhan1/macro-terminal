import handler from '../../api/reddit.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
