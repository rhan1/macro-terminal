import handler from '../../api/tryst.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
