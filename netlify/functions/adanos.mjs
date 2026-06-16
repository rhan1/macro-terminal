import handler from '../../api/adanos.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
