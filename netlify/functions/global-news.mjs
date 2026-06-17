import handler from '../../api/global-news.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
