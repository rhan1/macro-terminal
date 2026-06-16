import handler from '../../api/sentiment.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
