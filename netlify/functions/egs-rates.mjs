import handler from '../../api/egs-rates.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
