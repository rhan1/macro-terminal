import handler from '../../api/auctions.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
