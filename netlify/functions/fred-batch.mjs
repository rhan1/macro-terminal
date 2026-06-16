import handler from '../../api/fred-batch.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
