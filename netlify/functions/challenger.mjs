import handler from '../../api/challenger.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
