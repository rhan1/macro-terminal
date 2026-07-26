import handler from '../../api/economies.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
