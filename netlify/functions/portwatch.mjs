import handler from '../../api/portwatch.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
