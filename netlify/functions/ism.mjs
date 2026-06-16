import handler from '../../api/ism.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
