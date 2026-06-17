import handler from '../../api/shipments.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
