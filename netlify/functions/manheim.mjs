import handler from '../../api/manheim.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
