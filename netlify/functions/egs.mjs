import handler from '../../api/egs.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
