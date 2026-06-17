import handler from '../../api/cb.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
