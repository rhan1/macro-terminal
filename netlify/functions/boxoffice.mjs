import handler from '../../api/boxoffice.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
