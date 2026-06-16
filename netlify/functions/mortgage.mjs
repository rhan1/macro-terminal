import handler from '../../api/mortgage.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
