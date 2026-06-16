import handler from '../../api/fred.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
