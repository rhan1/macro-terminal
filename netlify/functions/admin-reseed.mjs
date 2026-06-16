import handler from '../../api/admin/reseed.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
