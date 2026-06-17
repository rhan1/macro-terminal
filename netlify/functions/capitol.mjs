import handler from '../../api/capitol.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
