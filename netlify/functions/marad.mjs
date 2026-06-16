import handler from '../../api/marad.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
