import handler from '../../api/layoffs.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
