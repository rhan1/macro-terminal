import handler from '../../api/fbx.js';
import { wrap } from '../lib/vercel-shim.mjs';
export default wrap(handler);
